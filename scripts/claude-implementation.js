// Claude-powered implementation generator for approved work items

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');

class ClaudeImplementationAgent {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
  }

  async generateImplementation(criteriaIssue, originalKey, requirements) {
    try {
      console.log(`🚀 Generating implementation for ${originalKey} with Claude...`);
      
      const implementationPrompt = this.buildImplementationPrompt(criteriaIssue, originalKey, requirements);
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8000,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: implementationPrompt
        }]
      });

      // Parse implementation - this now throws on failure instead of falling back
      const implementation = this.parseImplementationResponse(response.content[0].text);
      
      // Generate tests and documentation based on implementation type
      const tests = await this.generateTests(criteriaIssue, originalKey, implementation);
      const documentation = await this.generateDocumentation(criteriaIssue, originalKey, implementation);
      
      console.log(`✅ Implementation generated for ${originalKey}`);
      return {
        sourceCode: implementation.type === 'code' ? implementation.primaryDeliverable : null,
        implementation: implementation,
        tests: tests,
        documentation: documentation,
        validationResults: await this.validateImplementation(implementation, tests),
        metadata: {
          generatedAt: new Date().toISOString(),
          originalIssue: originalKey,
          criteriaIssue: criteriaIssue.key,
          claudeModel: 'claude-3-5-sonnet-20241022',
          implementationType: implementation.type
        }
      };

    } catch (error) {
      console.error('Claude implementation failed:', error);
      throw new Error(`Implementation generation failed: ${error.message}`);
    }
  }

  buildImplementationPrompt(criteriaIssue, originalKey, requirements) {
    return `You are a senior software engineer/analyst tasked with implementing a solution based on approved delivery criteria.

**Original Issue:** ${originalKey}
**Criteria Issue:** ${criteriaIssue.key}
**Summary:** ${criteriaIssue.fields.summary}
**Description:** ${criteriaIssue.fields.description || 'No description provided'}

**Requirements Analysis:**
${JSON.stringify(requirements, null, 2)}

**Your Task:**
Generate a complete, production-ready implementation that satisfies all the delivery criteria. This could be code, documentation, analysis, process design, or other deliverables depending on the requirements.

**Response Format:**
Provide your implementation in this JSON structure:

{
  "type": "code|documentation|analysis|process|other",
  "title": "Brief title of what was implemented",
  "description": "What this implementation provides",
  "primaryDeliverable": "Main content here (code, document text, analysis, etc.)",
  "supportingFiles": {
    "filename1.ext": "content of supporting file 1",
    "filename2.ext": "content of supporting file 2"
  },
  "implementationNotes": ["note 1", "note 2"],
  "usageInstructions": "How to use/deploy/apply this implementation",
  "dependencies": ["dependency1", "dependency2"],
  "configurationOptions": {
    "option1": "description",
    "option2": "description"  
  },
  "validationCriteria": ["how to verify this works", "acceptance test 1"],
  "performanceConsiderations": ["consideration 1", "consideration 2"]
}

**Guidelines for Different Types:**
- **Code**: Provide clean, maintainable, well-documented source code
- **Documentation**: Create comprehensive guides, specifications, or reports  
- **Analysis**: Deliver structured analysis with findings and recommendations
- **Process**: Design workflows, procedures, or methodologies
- **Other**: Any other type of deliverable as appropriate

**Quality Requirements:**
- Be thorough and complete
- Include proper error handling (for code) or risk mitigation (for other types)
- Add detailed explanations for complex logic or decisions
- Consider maintenance and scalability
- Make it actionable and practical

Respond with valid JSON only.`;
  }

  async generateTests(criteriaIssue, originalKey, implementation) {
    try {
      // Generate appropriate validation based on implementation type
      let testPrompt;
      
      switch (implementation.type) {
        case 'code':
          testPrompt = this.buildCodeTestPrompt(originalKey, implementation);
          break;
        case 'documentation':
          testPrompt = this.buildDocumentationValidationPrompt(originalKey, implementation);
          break;
        case 'analysis':
          testPrompt = this.buildAnalysisValidationPrompt(originalKey, implementation);
          break;
        case 'process':
          testPrompt = this.buildProcessValidationPrompt(originalKey, implementation);
          break;
        default:
          testPrompt = this.buildGenericValidationPrompt(originalKey, implementation);
      }

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: testPrompt
        }]
      });

      return {
        type: implementation.type,
        content: response.content[0].text,
        validationType: this.getValidationTypeForImplementation(implementation.type)
      };

    } catch (error) {
      console.error('Test generation failed:', error);
      throw new Error(`Failed to generate validation for ${implementation.type} implementation: ${error.message}`);
    }
  }

  buildCodeTestPrompt(originalKey, implementation) {
    return `Generate comprehensive test suite for the following code implementation:

**Original Issue:** ${originalKey}
**Implementation Type:** Code
**Source Code:**
${implementation.primaryDeliverable}

**Test Requirements:**
- Unit tests for all public methods
- Integration tests for main workflows
- Edge case and error handling tests
- Performance validation tests
- Mock external dependencies appropriately

Generate a complete test file using Jest/Mocha framework with proper setup, teardown, and assertions.

Respond with the complete test code only.`;
  }

  buildDocumentationValidationPrompt(originalKey, implementation) {
    return `Create validation criteria for the following documentation:

**Original Issue:** ${originalKey}
**Implementation Type:** Documentation
**Document Title:** ${implementation.title}
**Content Preview:** ${implementation.primaryDeliverable.substring(0, 500)}...

Generate a checklist and validation procedure to ensure this documentation:
- Covers all required topics completely
- Is accurate and up-to-date
- Is clear and accessible to the target audience
- Follows documentation standards
- Includes proper examples and references

Respond with a structured validation checklist and review procedure.`;
  }

  buildAnalysisValidationPrompt(originalKey, implementation) {
    return `Create validation criteria for the following analysis:

**Original Issue:** ${originalKey}
**Implementation Type:** Analysis
**Analysis Title:** ${implementation.title}
**Content Preview:** ${implementation.primaryDeliverable.substring(0, 500)}...

Generate validation criteria to ensure this analysis:
- Uses appropriate methodologies
- Has sufficient supporting evidence
- Reaches valid conclusions
- Addresses all required scope areas
- Provides actionable recommendations

Respond with a structured validation framework and peer review checklist.`;
  }

  buildProcessValidationPrompt(originalKey, implementation) {
    return `Create validation criteria for the following process design:

**Original Issue:** ${originalKey}
**Implementation Type:** Process
**Process Title:** ${implementation.title}
**Content Preview:** ${implementation.primaryDeliverable.substring(0, 500)}...

Generate validation criteria to ensure this process:
- Achieves the intended objectives
- Is practical and implementable
- Has clear roles and responsibilities
- Includes proper controls and checkpoints
- Can be measured and improved

Respond with a process validation checklist and pilot test plan.`;
  }

  buildGenericValidationPrompt(originalKey, implementation) {
    return `Create validation criteria for the following implementation:

**Original Issue:** ${originalKey}
**Implementation Type:** ${implementation.type}
**Title:** ${implementation.title}
**Content Preview:** ${implementation.primaryDeliverable.substring(0, 500)}...

Generate appropriate validation criteria based on the implementation type and content.
Focus on completeness, quality, usability, and alignment with original requirements.

Respond with a structured validation approach.`;
  }

  getValidationTypeForImplementation(implementationType) {
    const validationTypes = {
      'code': 'Automated Testing',
      'documentation': 'Content Review',
      'analysis': 'Peer Review',
      'process': 'Process Validation',
      'other': 'Custom Validation'
    };
    return validationTypes[implementationType] || 'Manual Review';
  }

  async generateDocumentation(criteriaIssue, originalKey, implementation) {
    try {
      let docPrompt;
      
      if (implementation.type === 'documentation') {
        // For documentation implementations, create meta-documentation
        docPrompt = `Create implementation notes for this documentation deliverable:

**Original Issue:** ${originalKey}
**Documentation Title:** ${implementation.title}

Create a brief implementation guide that includes:
- How to use/deploy this documentation
- Maintenance and update procedures
- Related documentation references
- Version control considerations

Keep it concise and practical.`;
      } else {
        // For other types, create comprehensive documentation
        docPrompt = `Generate comprehensive documentation for this implementation:

**Original Issue:** ${originalKey}
**Implementation Type:** ${implementation.type}
**Title:** ${implementation.title}
**Implementation:** ${JSON.stringify(implementation, null, 2)}

Create a detailed README.md with:
- Overview and purpose
- Installation/setup instructions (if applicable)
- Usage examples and instructions
- Configuration options
- Maintenance considerations
- Troubleshooting guide

Respond with the complete markdown documentation.`;
      }

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 3000,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: docPrompt
        }]
      });

      return response.content[0].text;

    } catch (error) {
      console.error('Documentation generation failed:', error);
      throw new Error(`Failed to generate documentation: ${error.message}`);
    }
  }

  parseImplementationResponse(claudeResponse) {
    console.log('DEBUG: Parsing Claude implementation response...');
    console.log('DEBUG: Response length:', claudeResponse.length);
    console.log('DEBUG: Response preview:', claudeResponse.substring(0, 200));
    
    try {
      const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('ERROR: No valid JSON found in Claude response');
        throw new Error('Claude response does not contain valid JSON structure');
      }
      
      const parsedImpl = JSON.parse(jsonMatch[0]);
      console.log('DEBUG: Parsed implementation keys:', Object.keys(parsedImpl));
      
      // Validate required fields
      if (!parsedImpl.type) {
        throw new Error('Implementation missing required field: type');
      }
      
      if (!parsedImpl.primaryDeliverable) {
        throw new Error('Implementation missing required field: primaryDeliverable');
      }
      
      if (!parsedImpl.title) {
        throw new Error('Implementation missing required field: title');
      }
      
      // Validate implementation type
      const validTypes = ['code', 'documentation', 'analysis', 'process', 'other'];
      if (!validTypes.includes(parsedImpl.type)) {
        throw new Error(`Invalid implementation type: ${parsedImpl.type}. Must be one of: ${validTypes.join(', ')}`);
      }
      
      console.log('DEBUG: Implementation successfully parsed');
      console.log('DEBUG: Type:', parsedImpl.type);
      console.log('DEBUG: Title:', parsedImpl.title);
      console.log('DEBUG: Primary deliverable length:', parsedImpl.primaryDeliverable.length);
      
      return parsedImpl;
      
    } catch (parseError) {
      console.error('ERROR: Failed to parse Claude implementation response');
      console.error('Parse error:', parseError.message);
      console.error('Raw response excerpt:', claudeResponse.substring(0, 500));
      
      // Don't fall back - throw the error to be handled upstream
      throw new Error(`Failed to parse Claude implementation response: ${parseError.message}`);
    }
  }

  async validateImplementation(implementation, tests) {
    try {
      console.log('DEBUG: Validating implementation...');
      console.log('DEBUG: Implementation type:', implementation.type);
      
      const validation = {
        implementationType: implementation.type,
        contentQuality: this.analyzeContentQuality(implementation),
        completeness: this.analyzeCompleteness(implementation),
        usability: this.analyzeUsability(implementation),
        testQuality: this.analyzeTestQuality(tests),
        typeSpecificValidation: this.performTypeSpecificValidation(implementation)
      };

      const overallScore = this.calculateOverallScore(validation);
      const passed = overallScore >= 7.0;

      console.log('DEBUG: Validation complete');
      console.log('DEBUG: Overall score:', overallScore);
      console.log('DEBUG: Passed:', passed);

      return {
        passed: passed,
        overallScore: overallScore,
        overall: this.getQualityRating(overallScore),
        details: validation,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Validation failed:', error);
      return {
        passed: false,
        overall: 'Validation Error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  analyzeContentQuality(implementation) {
    const primaryLength = implementation.primaryDeliverable.length;
    const hasDescription = implementation.description && implementation.description.length > 10;
    const hasUsageInstructions = implementation.usageInstructions && implementation.usageInstructions.length > 10;
    const hasValidationCriteria = implementation.validationCriteria && implementation.validationCriteria.length > 0;
    
    let score = 5;
    if (primaryLength > 100) score += 1;
    if (primaryLength > 1000) score += 1;
    if (hasDescription) score += 1;
    if (hasUsageInstructions) score += 1;
    if (hasValidationCriteria) score += 1;
    
    return {
      score: Math.min(score, 10),
      contentLength: primaryLength,
      hasDescription,
      hasUsageInstructions,
      hasValidationCriteria
    };
  }

  analyzeCompleteness(implementation) {
    const requiredFields = ['type', 'title', 'description', 'primaryDeliverable', 'usageInstructions'];
    const presentFields = requiredFields.filter(field => implementation[field]);
    const completenessRatio = presentFields.length / requiredFields.length;
    
    return {
      score: Math.round(completenessRatio * 10),
      requiredFields,
      presentFields,
      completenessRatio
    };
  }

  analyzeUsability(implementation) {
    const hasUsageInstructions = !!(implementation.usageInstructions && implementation.usageInstructions.length > 20);
    const hasDependencies = !!(implementation.dependencies && implementation.dependencies.length > 0);
    const hasConfiguration = !!(implementation.configurationOptions && Object.keys(implementation.configurationOptions).length > 0);
    
    let score = 5;
    if (hasUsageInstructions) score += 2;
    if (hasDependencies) score += 1;
    if (hasConfiguration) score += 2;
    
    return {
      score: Math.min(score, 10),
      hasUsageInstructions,
      hasDependencies,
      hasConfiguration
    };
  }

  analyzeTestQuality(tests) {
    if (!tests || !tests.content) {
      return { score: 0, hasTests: false };
    }
    
    const content = tests.content;
    const testPatterns = tests.type === 'code' 
      ? ['test(', 'it(', 'describe(', 'expect(', 'assert']
      : ['validation', 'check', 'verify', 'review', 'criteria'];
    
    const foundPatterns = testPatterns.filter(pattern => content.includes(pattern));
    const score = Math.min(foundPatterns.length * 2, 10);
    
    return {
      score,
      hasTests: true,
      testType: tests.type,
      validationType: tests.validationType,
      foundPatterns: foundPatterns.length
    };
  }

  performTypeSpecificValidation(implementation) {
    switch (implementation.type) {
      case 'code':
        return this.validateCodeImplementation(implementation);
      case 'documentation':
        return this.validateDocumentationImplementation(implementation);
      case 'analysis':
        return this.validateAnalysisImplementation(implementation);
      case 'process':
        return this.validateProcessImplementation(implementation);
      default:
        return this.validateGenericImplementation(implementation);
    }
  }

  validateCodeImplementation(implementation) {
    const code = implementation.primaryDeliverable;
    return {
      hasErrorHandling: code.includes('try') && code.includes('catch'),
      hasAsyncHandling: code.includes('async') && code.includes('await'),
      hasModularStructure: code.includes('class') || code.includes('function') || code.includes('module.exports'),
      hasComments: code.includes('//') || code.includes('/*'),
      linesOfCode: code.split('\n').length
    };
  }

  validateDocumentationImplementation(implementation) {
    const doc = implementation.primaryDeliverable;
    return {
      hasStructure: doc.includes('#') || doc.includes('##'),
      hasExamples: doc.includes('```') || doc.includes('example'),
      hasReferences: doc.includes('http') || doc.includes('link'),
      wordCount: doc.split(/\s+/).length,
      hasTOC: doc.toLowerCase().includes('table of contents') || doc.includes('- [')
    };
  }

  validateAnalysisImplementation(implementation) {
    const analysis = implementation.primaryDeliverable;
    return {
      hasMethodology: analysis.toLowerCase().includes('method') || analysis.toLowerCase().includes('approach'),
      hasFindings: analysis.toLowerCase().includes('finding') || analysis.toLowerCase().includes('result'),
      hasRecommendations: analysis.toLowerCase().includes('recommend') || analysis.toLowerCase().includes('suggest'),
      hasEvidence: analysis.includes('data') || analysis.includes('evidence') || analysis.includes('source'),
      wordCount: analysis.split(/\s+/).length
    };
  }

  validateProcessImplementation(implementation) {
    const process = implementation.primaryDeliverable;
    return {
      hasSteps: process.includes('step') || process.includes('phase') || process.includes('stage'),
      hasRoles: process.toLowerCase().includes('role') || process.toLowerCase().includes('responsible'),
      hasControls: process.toLowerCase().includes('check') || process.toLowerCase().includes('control'),
      hasMeasurement: process.toLowerCase().includes('measure') || process.toLowerCase().includes('metric'),
      wordCount: process.split(/\s+/).length
    };
  }

  validateGenericImplementation(implementation) {
    const content = implementation.primaryDeliverable;
    return {
      hasStructure: content.length > 100,
      hasDetail: content.split(/\s+/).length > 50,
      isActionable: content.toLowerCase().includes('how') || content.toLowerCase().includes('step'),
      contentType: implementation.type,
      wordCount: content.split(/\s+/).length
    };
  }

  calculateOverallScore(validation) {
    const scores = [
      validation.contentQuality.score,
      validation.completeness.score,
      validation.usability.score,
      validation.testQuality.score
    ];
    
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  getQualityRating(score) {
    if (score >= 9) return 'Excellent';
    if (score >= 8) return 'Very Good';
    if (score >= 7) return 'Good';
    if (score >= 6) return 'Acceptable';
    if (score >= 5) return 'Needs Improvement';
    return 'Poor';
  }
}

module.exports = ClaudeImplementationAgent;