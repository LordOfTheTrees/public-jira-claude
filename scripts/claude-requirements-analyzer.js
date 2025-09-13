// Claude-powered requirements analysis for Jira work items

const { Anthropic } = require('@anthropic-ai/sdk');

class ClaudeRequirementsAnalyzer {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
  }

  async analyzeRequirements(jiraIssue) {
    try {
      console.log(`🔍 Analyzing requirements for ${jiraIssue.key} with Claude...`);
      
      const analysisPrompt = this.buildAnalysisPrompt(jiraIssue);
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: analysisPrompt
        }]
      });

      const analysis = this.parseAnalysisResponse(response.content[0].text);
      
      console.log(`✅ Requirements analysis complete for ${jiraIssue.key}`);
      return {
        deliveryCriteria: analysis.deliveryCriteria,
        validationTests: analysis.validationTests,
        technicalApproach: analysis.technicalApproach,
        estimatedEffort: analysis.estimatedEffort,
        rawAnalysis: response.content[0].text
      };

    } catch (error) {
      console.error('Claude requirements analysis failed:', error);
      throw new Error(`Requirements analysis failed: ${error.message}`);
    }
  }

  buildAnalysisPrompt(jiraIssue) {
    return `You are a senior software analyst tasked with analyzing a Jira work item and creating comprehensive delivery criteria.

**Jira Issue Details:**
- Key: ${jiraIssue.key}
- Type: ${jiraIssue.fields.issuetype.name}
- Summary: ${jiraIssue.fields.summary}
- Description: ${jiraIssue.fields.description || 'No description provided'}
- Priority: ${jiraIssue.fields.priority?.name || 'Not specified'}
- Project: ${jiraIssue.fields.project.name}

**Your Task:**
Analyze this work item and provide a comprehensive analysis in the following JSON format:

{
  "deliveryCriteria": {
    "functionalRequirements": ["requirement 1", "requirement 2"],
    "technicalRequirements": ["requirement 1", "requirement 2"],
    "qualityRequirements": ["requirement 1", "requirement 2"],
    "acceptanceCriteria": ["criteria 1", "criteria 2"],
    "definitionOfDone": ["item 1", "item 2"]
  },
  "validationTests": {
    "unitTests": ["test scenario 1", "test scenario 2"],
    "integrationTests": ["test scenario 1", "test scenario 2"],
    "edgeCases": ["edge case 1", "edge case 2"],
    "performanceTests": ["performance requirement 1"]
  },
  "technicalApproach": {
    "architecture": "Brief architectural approach",
    "components": ["component 1", "component 2"],
    "dependencies": ["dependency 1", "dependency 2"],
    "risks": ["risk 1", "risk 2"],
    "mitigations": ["mitigation 1", "mitigation 2"]
  },
  "estimatedEffort": {
    "storyPoints": 5,
    "hours": 20,
    "complexity": "Medium",
    "confidence": "High",
    "assumptions": ["assumption 1", "assumption 2"]
  }
}

**Guidelines:**
- Be specific and actionable in your requirements
- Consider edge cases and error scenarios
- Include performance and security considerations
- Provide realistic effort estimates
- Focus on testable acceptance criteria

Respond with valid JSON only.`;
  }

  parseAnalysisResponse(claudeResponse) {
    try {
      // Extract JSON from Claude's response
      const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in Claude response');
      }
      
      const parsedAnalysis = JSON.parse(jsonMatch[0]);
      
      // Validate required structure
      if (!parsedAnalysis.deliveryCriteria || !parsedAnalysis.validationTests) {
        throw new Error('Missing required analysis sections');
      }
      
      return parsedAnalysis;
      
    } catch (error) {
      console.error('Failed to parse Claude analysis:', error);
      // Return fallback structure
      return this.getFallbackAnalysis();
    }
  }

  getFallbackAnalysis() {
    return {
      deliveryCriteria: {
        functionalRequirements: ['Core functionality implemented as described'],
        technicalRequirements: ['Code follows project standards'],
        qualityRequirements: ['Unit tests with >80% coverage'],
        acceptanceCriteria: ['All functional requirements met'],
        definitionOfDone: ['Code reviewed and deployed']
      },
      validationTests: {
        unitTests: ['Test core functionality'],
        integrationTests: ['Test system integration'],
        edgeCases: ['Test error handling'],
        performanceTests: ['Validate performance requirements']
      },
      technicalApproach: {
        architecture: 'Standard implementation approach',
        components: ['Main component'],
        dependencies: ['Standard project dependencies'],
        risks: ['Implementation complexity'],
        mitigations: ['Thorough testing and code review']
      },
      estimatedEffort: {
        storyPoints: 5,
        hours: 16,
        complexity: 'Medium',
        confidence: 'Medium',
        assumptions: ['Requirements are clear and complete']
      }
    };
  }
}

module.exports = ClaudeRequirementsAnalyzer;
