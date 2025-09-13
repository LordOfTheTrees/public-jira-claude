// Claude-powered evaluation of implementations against deliverable criteria

const { Anthropic } = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');

class ClaudeTestingEvaluator {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
  }

  async evaluateImplementation(criteriaIssue, originalKey, implementationResult) {
    try {
      console.log(`🔍 Evaluating implementation for ${originalKey} against deliverable criteria...`);
      
      // Load the implementation artifacts from filesystem
      const implementationArtifacts = await this.loadImplementationArtifacts(originalKey);
      
      // Extract criteria from the criteria issue
      const deliveryCriteria = this.extractDeliveryCriteria(criteriaIssue);
      
      // Perform Claude-powered evaluation
      const evaluation = await this.performClaudeEvaluation(
        originalKey,
        criteriaIssue,
        implementationResult,
        implementationArtifacts,
        deliveryCriteria
      );
      
      // Calculate final scoring
      const finalScore = this.calculateFinalScore(evaluation);
      
      console.log(`✅ Evaluation complete for ${originalKey}`);
      console.log(`DEBUG: Final score: ${finalScore.overallScore}/100`);
      console.log(`DEBUG: Errors found: ${finalScore.errorCount}`);
      console.log(`DEBUG: Meets criteria: ${finalScore.meetsCriteria}`);
      
      return {
        originalIssue: originalKey,
        criteriaIssue: criteriaIssue.key,
        implementationType: implementationResult.implementation.type,
        evaluation: evaluation,
        finalScore: finalScore,
        recommendation: this.generateRecommendation(finalScore, evaluation),
        evaluatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Claude evaluation failed:', error);
      throw new Error(`Implementation evaluation failed: ${error.message}`);
    }
  }

  async loadImplementationArtifacts(originalKey) {
    try {
      console.log(`DEBUG: Loading implementation artifacts for ${originalKey}`);
      
      const implementationDir = path.join(process.cwd(), 'work-items', originalKey, 'implementation');
      const files = await fs.readdir(implementationDir);
      
      console.log(`DEBUG: Found ${files.length} artifact files`);
      
      const artifacts = {};
      for (const filename of files) {
        const filePath = path.join(implementationDir, filename);
        const content = await fs.readFile(filePath, 'utf8');
        artifacts[filename] = content;
        console.log(`DEBUG: Loaded ${filename} (${content.length} chars)`);
      }
      
      return artifacts;
      
    } catch (error) {
      console.error(`Failed to load implementation artifacts: ${error.message}`);
      throw error;
    }
  }

  extractDeliveryCriteria(criteriaIssue) {
    const description = criteriaIssue.fields.description || '';
    
    return {
      functionalRequirements: this.extractSection(description, 'Functional Requirements'),
      technicalRequirements: this.extractSection(description, 'Technical Requirements'),
      acceptanceCriteria: this.extractSection(description, 'Acceptance Criteria'),
      validationTests: this.extractSection(description, 'Validation Tests'),
      definitionOfDone: this.extractSection(description, 'Definition of Done'),
      estimatedEffort: this.extractEffortDetails(description)
    };
  }

  extractSection(text, sectionName) {
    const regex = new RegExp(`## ${sectionName}([\\s\\S]*?)(?=##|$)`, 'i');
    const match = text.match(regex);
    if (!match) return [];
    
    return match[1]
      .split('\n')
      .filter(line => line.trim().startsWith('•') || line.trim().startsWith('-'))
      .map(line => line.replace(/^[•-]\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  extractEffortDetails(text) {
    const storyPointsMatch = text.match(/\*\*Story Points:\*\* (\d+)/);
    const complexityMatch = text.match(/\*\*Complexity:\*\* (\w+)/);
    const hoursMatch = text.match(/\*\*Hours:\*\* (\d+)/);
    
    return {
      storyPoints: storyPointsMatch ? parseInt(storyPointsMatch[1]) : null,
      complexity: complexityMatch ? complexityMatch[1] : null,
      hours: hoursMatch ? parseInt(hoursMatch[1]) : null
    };
  }

  async performClaudeEvaluation(originalKey, criteriaIssue, implementationResult, artifacts, criteria) {
    console.log(`DEBUG: Starting Claude evaluation for ${originalKey}`);
    
    const evaluationPrompt = this.buildEvaluationPrompt(
      originalKey, 
      criteriaIssue, 
      implementationResult, 
      artifacts, 
      criteria
    );
    
    console.log(`DEBUG: Evaluation prompt length: ${evaluationPrompt.length} chars`);
    
    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 6000,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: evaluationPrompt
      }]
    });

    console.log(`DEBUG: Claude evaluation response received`);
    return this.parseEvaluationResponse(response.content[0].text);
  }

  buildEvaluationPrompt(originalKey, criteriaIssue, implementationResult, artifacts, criteria) {
    const implementation = implementationResult.implementation;
    
    return `You are a senior product manager conducting a thorough evaluation of an implementation against its deliverable criteria.

**Evaluation Task:** ${originalKey}
**Implementation Type:** ${implementation.type}
**Implementation Title:** ${implementation.title}

**DELIVERABLE CRITERIA TO EVALUATE AGAINST:**

**Functional Requirements:**
${criteria.functionalRequirements.map(req => `• ${req}`).join('\n')}

**Technical Requirements:**
${criteria.technicalRequirements.map(req => `• ${req}`).join('\n')}

**Acceptance Criteria:**
${criteria.acceptanceCriteria.map(req => `• ${req}`).join('\n')}

**Definition of Done:**
${criteria.definitionOfDone.map(req => `• ${req}`).join('\n')}

**IMPLEMENTATION ARTIFACTS:**
${Object.entries(artifacts).map(([filename, content]) => `
**File: ${filename}**
\`\`\`
${content.length > 2000 ? content.substring(0, 2000) + '...[truncated]' : content}
\`\`\`
`).join('\n')}

**YOUR EVALUATION TASK:**
Conduct a comprehensive product management evaluation using these success criteria:

1. **Requirements Coverage** (0-25 points): How completely does the implementation address all functional and technical requirements?

2. **Quality & Craftsmanship** (0-25 points): How well-executed is the implementation? Consider code quality, documentation clarity, thoroughness, etc.

3. **Usability & Practicality** (0-25 points): How usable and practical is the implementation for its intended purpose?

4. **Completeness & Polish** (0-25 points): How complete and polished is the implementation? Are there gaps or rough edges?

**CRITICAL:** You must also identify any ERRORS, DEFECTS, or CRITICAL ISSUES that would prevent deployment/use.

**Response Format (JSON only):**
{
  "requirementsCoverage": {
    "score": 0-25,
    "analysis": "detailed analysis",
    "coveredRequirements": ["req1", "req2"],
    "missedRequirements": ["req3"],
    "partialRequirements": ["req4"]
  },
  "qualityCraftsmanship": {
    "score": 0-25,
    "analysis": "detailed analysis",
    "strengths": ["strength1", "strength2"],
    "weaknesses": ["weakness1", "weakness2"]
  },
  "usabilityPracticality": {
    "score": 0-25,
    "analysis": "detailed analysis",
    "usabilityStrengths": ["strength1"],
    "usabilityWeaknesses": ["weakness1"]
  },
  "completenessPolish": {
    "score": 0-25,
    "analysis": "detailed analysis",
    "completedAspects": ["aspect1"],
    "incompleteAspects": ["aspect2"]
  },
  "errors": [
    {
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "type": "FUNCTIONAL|TECHNICAL|USABILITY|DOCUMENTATION",
      "description": "specific error description",
      "impact": "how this affects deployment/usage",
      "recommendation": "how to fix this"
    }
  ],
  "overallAssessment": {
    "summary": "brief overall assessment",
    "readyForDeployment": true/false,
    "majorConcerns": ["concern1", "concern2"],
    "recommendations": ["recommendation1", "recommendation2"]
  }
}

Be thorough, objective, and specific in your evaluation. Focus on whether this implementation would actually work and meet the original business need.`;
  }

  parseEvaluationResponse(claudeResponse) {
    console.log('DEBUG: Parsing Claude evaluation response...');
    console.log('DEBUG: Response length:', claudeResponse.length);
    
    try {
      const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Claude evaluation response does not contain valid JSON structure');
      }
      
      const evaluation = JSON.parse(jsonMatch[0]);
      console.log('DEBUG: Evaluation successfully parsed');
      console.log('DEBUG: Evaluation sections:', Object.keys(evaluation));
      
      // Validate required sections
      const requiredSections = [
        'requirementsCoverage',
        'qualityCraftsmanship', 
        'usabilityPracticality',
        'completenessPolish',
        'errors',
        'overallAssessment'
      ];
      
      for (const section of requiredSections) {
        if (!evaluation[section]) {
          throw new Error(`Missing required evaluation section: ${section}`);
        }
      }
      
      return evaluation;
      
    } catch (parseError) {
      console.error('ERROR: Failed to parse Claude evaluation response');
      console.error('Parse error:', parseError.message);
      throw new Error(`Failed to parse Claude evaluation response: ${parseError.message}`);
    }
  }

  calculateFinalScore(evaluation) {
    const scores = [
      evaluation.requirementsCoverage.score,
      evaluation.qualityCraftsmanship.score,
      evaluation.usabilityPracticality.score,
      evaluation.completenessPolish.score
    ];
    
    const overallScore = scores.reduce((sum, score) => sum + score, 0);
    const errorCount = evaluation.errors.length;
    const criticalErrors = evaluation.errors.filter(e => e.severity === 'CRITICAL').length;
    const highErrors = evaluation.errors.filter(e => e.severity === 'HIGH').length;
    
    // Updated passing criteria - focus on core deliverability
    const PASSING_SCORE = 80; // 80/100
    
    // Check if errors are actually blocking deployment of core deliverable
    const hasBlockingErrors = criticalErrors > 0 || highErrors > 0;
    
    // Core deliverable assessment - does it meet the original functional requirements?
    const coreRequirementsMet = evaluation.requirementsCoverage.score >= 20; // 20/25 minimum for core requirements
    
    const meetsCriteria = overallScore >= PASSING_SCORE && 
                        !hasBlockingErrors && 
                        coreRequirementsMet &&
                        evaluation.overallAssessment.readyForDeployment;
    
    return {
      overallScore,
      maxScore: 100,
      scorePercentage: overallScore,
      errorCount,
      criticalErrors,
      highErrors,
      blockingErrors: criticalErrors + highErrors,
      meetsCriteria,
      passingScore: PASSING_SCORE,
      readyForDeployment: evaluation.overallAssessment.readyForDeployment,
      coreRequirementsMet,
      breakdown: {
        requirementsCoverage: evaluation.requirementsCoverage.score,
        qualityCraftsmanship: evaluation.qualityCraftsmanship.score,
        usabilityPracticality: evaluation.usabilityPracticality.score,
        completenessPolish: evaluation.completenessPolish.score
      }
    };
  }

  generateRecommendation(finalScore, evaluation) {
    if (finalScore.meetsCriteria) {
      return {
        status: 'APPROVED',
        action: 'READY_FOR_DEPLOYMENT',
        summary: `Implementation meets all criteria with score ${finalScore.overallScore}/100 and zero errors.`,
        nextSteps: [
          'Proceed to deployment/implementation',
          'Update stakeholders on completion',
          'Monitor post-deployment metrics'
        ]
      };
    } else {
      const issues = [];
      if (finalScore.overallScore < finalScore.passingScore) {
        issues.push(`Score ${finalScore.overallScore}/100 below required ${finalScore.passingScore}/100`);
      }
      if (finalScore.errorCount > 0) {
        issues.push(`${finalScore.errorCount} errors found (${finalScore.criticalErrors} critical, ${finalScore.highErrors} high)`);
      }
      if (!finalScore.readyForDeployment) {
        issues.push('Claude assessment indicates not ready for deployment');
      }
      
      return {
        status: 'NEEDS_WORK',
        action: 'RETURN_FOR_REVISION',
        summary: `Implementation needs revision: ${issues.join(', ')}`,
        nextSteps: [
          'Address identified errors and issues',
          'Improve implementation quality',
          'Re-submit for evaluation'
        ],
        criticalIssues: evaluation.errors.filter(e => e.severity === 'CRITICAL'),
        majorConcerns: evaluation.overallAssessment.majorConcerns
      };
    }
  }

  generateUsageInstructions(implementationType, artifacts, evaluation) {
    switch (implementationType) {
      case 'code':
        return this.generateCodeUsageInstructions(artifacts, evaluation);
      case 'documentation':
        return this.generateDocumentationUsageInstructions(artifacts, evaluation);
      case 'analysis':
        return this.generateAnalysisUsageInstructions(artifacts, evaluation);
      case 'process':
        return this.generateProcessUsageInstructions(artifacts, evaluation);
      default:
        return this.generateGenericUsageInstructions(artifacts, evaluation);
    }
  }

  generateCodeUsageInstructions(artifacts, evaluation) {
    const hasPackageJson = artifacts['package.json'];
    const hasTests = artifacts['tests.js'];
    
    return `**Code Implementation Usage Instructions:**

1. **Installation:**
   ${hasPackageJson ? '```bash\nnpm install\n```' : 'No package.json found - install dependencies manually'}

2. **Running:**
   \`\`\`bash
   node solution.js
   \`\`\`

3. **Testing:**
   ${hasTests ? '```bash\nnpm test\n# or\nnode tests.js\n```' : 'No automated tests available'}

4. **Integration:**
   \`\`\`javascript
   const Solution = require('./solution.js');
   const solution = new Solution();
   // Use according to implementation
   \`\`\`

5. **Deployment:** Ready for ${evaluation.overallAssessment.readyForDeployment ? 'production' : 'development/testing'} environment`;
  }

  generateDocumentationUsageInstructions(artifacts, evaluation) {
    return `**Documentation Usage Instructions:**

1. **Primary Document:** See document.md for main content
2. **Distribution:** Share with intended audience as specified in requirements  
3. **Maintenance:** Update as needed based on feedback and changes
4. **Format:** Markdown format - can be converted to PDF, HTML, or other formats as needed
5. **Status:** ${evaluation.overallAssessment.readyForDeployment ? 'Ready for publication' : 'Needs revision before publication'}`;
  }

  generateAnalysisUsageInstructions(artifacts, evaluation) {
    return `**Analysis Usage Instructions:**

1. **Review:** Examine analysis.md for findings and recommendations
2. **Action Items:** Implement recommendations as prioritized
3. **Validation:** Verify findings with stakeholders
4. **Follow-up:** Schedule review of recommendations implementation
5. **Status:** ${evaluation.overallAssessment.readyForDeployment ? 'Ready for stakeholder review' : 'Needs additional work before presentation'}`;
  }

  generateProcessUsageInstructions(artifacts, evaluation) {
    return `**Process Implementation Usage Instructions:**

1. **Review:** Examine process.md for detailed procedures
2. **Pilot:** Consider pilot implementation before full rollout
3. **Training:** Train relevant stakeholders on new process
4. **Monitoring:** Establish metrics to measure process effectiveness
5. **Status:** ${evaluation.overallAssessment.readyForDeployment ? 'Ready for implementation' : 'Needs refinement before rollout'}`;
  }

  generateGenericUsageInstructions(artifacts, evaluation) {
    return `**Implementation Usage Instructions:**

1. **Review:** Examine all generated artifacts
2. **Validation:** Verify implementation meets your specific needs
3. **Deployment:** Follow any specific instructions in README.md
4. **Support:** Refer to documentation for detailed guidance
5. **Status:** ${evaluation.overallAssessment.readyForDeployment ? 'Ready for use' : 'Needs additional work'}`;
  }
}

module.exports = ClaudeTestingEvaluator;