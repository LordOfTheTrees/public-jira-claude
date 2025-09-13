// Main orchestrator for processing Jira webhooks with Claude integration

const ClaudeRequirementsAnalyzer = require('./claude-requirements-analyzer.js');
const ClaudeImplementationAgent = require('./claude-implementation.js');
const JiraApiHelpers = require('./jira-api-helpers.js');
const ClaudeTestingEvaluator = require('./claude-testing-evaluator.js');

class JiraWebhookProcessor {
  constructor() {
    this.requirementsAnalyzer = new ClaudeRequirementsAnalyzer();
    this.implementationAgent = new ClaudeImplementationAgent();
    this.testingEvaluator = new ClaudeTestingEvaluator();
    this.jiraApi = new JiraApiHelpers();
  }

  async processWebhook(webhookPayload) {
    const startTime = Date.now();
    console.log(`\n=== WEBHOOK PROCESSING START [${new Date().toISOString()}] ===`);
    console.log(`DEBUG: Raw webhook payload keys:`, Object.keys(webhookPayload));
    console.log(`DEBUG: Webhook event type:`, webhookPayload.webhookEvent);
    console.log(`DEBUG: Issue key:`, webhookPayload.issue?.key);
    
    try {
      console.log(`Processing webhook for issue: ${webhookPayload.issue?.key || 'unknown'}`);
      
      // Validate webhook payload
      console.log(`\n--- VALIDATION PHASE ---`);
      const isValid = this.isValidWebhookEvent(webhookPayload);
      console.log(`DEBUG: Webhook validation result:`, isValid);
      
      if (!isValid) {
        const result = { action: 'ignored', reason: 'Non-actionable event' };
        console.log('Ignoring non-actionable webhook event');
        console.log(`=== WEBHOOK PROCESSING END (${Date.now() - startTime}ms) ===\n`);
        return result;
      }

      // Classify the issue type using Claude markers
      console.log(`\n--- CLASSIFICATION PHASE ---`);
      const classification = this.classifyIssueType(webhookPayload);
      console.log(`Issue classification: ${classification}`);

      console.log(`\n--- PROCESSING PHASE ---`);
      let result;
      
      switch (classification) {
        case 'initial_inquiry':
          console.log(`Routing to initial inquiry processing`);
          result = await this.processInitialInquiry(webhookPayload);
          break;
        
        case 'deliverable_criteria':
          console.log(`Routing to deliverable criteria processing`);
          result = await this.processDeliverableCriteria(webhookPayload);
          break;
          
        case 'testing_criteria':
          console.log(`Routing to testing criteria evaluation`);
          result = await this.processTestingCriteria(webhookPayload);
          break;
        
        case 'ignore':
        default:
          console.log(`No processing required`);
          result = { action: 'ignored', reason: 'No action required for this issue type' };
          break;
      }

      console.log(`\n--- FINAL RESULT ---`);
      console.log(`DEBUG: Processing result:`, result);
      console.log(`=== WEBHOOK PROCESSING END (${Date.now() - startTime}ms) ===\n`);
      
      return result;

    } catch (error) {
      console.error(`\n=== WEBHOOK PROCESSING ERROR [${new Date().toISOString()}] ===`);
      console.error('Webhook processing failed:', error.message);
      console.error('Error name:', error.name);
      console.error('Error stack:', error.stack);
      if (error.response) {
        console.error('HTTP Response status:', error.response.status);
        console.error('HTTP Response data:', JSON.stringify(error.response.data, null, 2));
      }
      console.error(`=== ERROR END (${Date.now() - startTime}ms) ===\n`);
      
      throw new Error(`Webhook processing failed: ${error.message}`);
    }
  }

  async processDeliverableCriteria(webhookPayload) {
    const issue = webhookPayload.issue;
    
    console.log(`\n--- DELIVERABLE CRITERIA PROCESSING ---`);
    console.log(`DEBUG: Processing deliverable criteria: ${issue.key}`);
    
    try {
      // Validate this is a legitimate Claude-generated criteria issue
      if (!this.validateClaudeGeneratedCriteria(issue)) {
        throw new Error('Deliverable criteria must be Claude-generated to proceed with implementation');
      }

      // Extract original issue key from summary
      const originalKey = this.extractOriginalIssueKey(issue.fields.summary, issue.fields.description);
      if (!originalKey) {
        throw new Error('Could not extract original issue key from deliverable criteria');
      }

      console.log(`DEBUG: Original issue: ${originalKey}`);
      
      // Check stage progression
      const highestStage = this.getHighestStageCompleted(issue);
      const hasForceReimplement = this.hasOverrideLabel ? this.hasOverrideLabel(issue, 'reimplement') : false;
      
      if ((highestStage === 'implemented' || highestStage === 'tested') && !hasForceReimplement) {
        console.log(`Skipping implementation - already completed (stage: ${highestStage})`);
        
        await this.jiraApi.addComment(
          issue.key,
          this.jiraApi.formatComment(
            'Implementation Skipped',
            `Implementation was skipped because it has already been completed (stage: ${highestStage}).\n\nTo force regeneration, add the label \`claude-force-reimplement\` and try again.`,
            '*Skipped by Claude Automation System*'
          )
        );
        
        return { 
          action: 'skipped', 
          reason: 'Implementation already exists', 
          stage: highestStage,
          criteriaIssue: issue.key,
          originalIssue: originalKey
        };
      }

      // Remove override label if present
      if (hasForceReimplement && this.removeOverrideLabel) {
        try {
          await this.removeOverrideLabel(issue.key, 'reimplement');
        } catch (labelError) {
          console.error('Failed to remove override label:', labelError.message);
        }
      }

      // Step 1: Get original issue details
      const originalIssue = await this.jiraApi.getIssue(originalKey);
      
      // Step 2: Load requirements from criteria issue
      const requirements = this.extractRequirementsFromCriteria(issue);
      
      // Step 3: Generate implementation with Claude
      console.log('DEBUG: Calling Claude for implementation generation...');
      let implementation;
      
      try {
        implementation = await this.implementationAgent.generateImplementation(
          issue, 
          originalKey, 
          requirements
        );
        
        console.log('DEBUG: Implementation generation successful');
        console.log('DEBUG: Implementation type:', implementation.implementation.type);
        console.log('DEBUG: Implementation title:', implementation.implementation.title);
        
      } catch (implementationError) {
        console.error('DEBUG: Implementation generation failed:', implementationError.message);
        
        // Report specific failure to Jira
        await this.jiraApi.addComment(
          issue.key,
          this.jiraApi.formatComment(
            'Implementation Generation Failed',
            `An error occurred during automated implementation generation:\n\n\`${implementationError.message}\`\n\nPlease review the deliverable criteria and try again.`,
            '*Error logged by Claude Automation System*'
          )
        );
        
        return {
          action: 'implementation_failed',
          criteriaIssue: issue.key,
          originalIssue: originalKey,
          error: implementationError.message,
          errorType: 'claude_generation_failure'
        };
      }
      
      // Step 4: Create implementation artifacts
      console.log('DEBUG: Creating implementation artifacts...');
      let artifactsResult;
      
      try {
        artifactsResult = await this.createImplementationArtifacts(originalKey, implementation);
        console.log('DEBUG: Artifacts creation successful');
        
      } catch (artifactsError) {
        console.error('DEBUG: Artifacts creation failed:', artifactsError.message);
        
        // Report artifact creation failure
        await this.jiraApi.addComment(
          issue.key,
          this.jiraApi.formatComment(
            'Artifacts Creation Failed',
            `Implementation was generated successfully, but failed to create file artifacts:\n\n\`${artifactsError.message}\`\n\nPlease check file system permissions and try again.`,
            '*Error logged by Claude Automation System*'
          )
        );
        
        return {
          action: 'artifacts_failed',
          criteriaIssue: issue.key,
          originalIssue: originalKey,
          implementation: implementation,
          error: artifactsError.message,
          errorType: 'artifacts_creation_failure'
        };
      }
      
      // Step 5: Update criteria issue with success
      console.log('DEBUG: Updating issue with success status...');
      await this.jiraApi.addComment(
        issue.key,
        this.jiraApi.formatComment(
          'Implementation Generated',
          `Claude has successfully generated the implementation for ${originalKey}.

  **Implementation Details:**
  - Type: ${implementation.implementation.type}
  - Title: ${implementation.implementation.title}

  **Artifacts Created:**
  ${artifactsResult.files.map(file => `• ${file}`).join('\n')}

  **Next Steps:**
  1. Review generated implementation in repository
  2. Move to "Testing Criteria" status to trigger automated evaluation
  3. Or proceed with manual testing and review

  **Repository Location:** \`work-items/${originalKey}/implementation/\``,
          '*Generated by Claude Automation System*'
        )
      );
      
      // Step 6: Update stage label (don't let this break the flow)
      try {
        await this.updateStageLabel(issue.key, 'implemented');
      } catch (labelError) {
        console.error('Failed to update stage label, but continuing:', labelError.message);
      }
      
      console.log(`DEBUG: Deliverable criteria processing complete for ${issue.key}`);
      
      return {
        action: 'implementation_generated',
        criteriaIssue: issue.key,
        originalIssue: originalKey,
        implementation: implementation,
        artifacts: artifactsResult
      };

    } catch (error) {
      console.error(`DEBUG: Failed to process deliverable criteria ${issue.key}:`, error);
      
      // Generic failure handling for other errors
      await this.jiraApi.addComment(
        issue.key,
        this.jiraApi.formatComment(
          'Automation System Error',
          `An error occurred in the Claude automation system:\n\n\`${error.message}\`\n\nPlease check the system logs and try again, or proceed with manual processing.`,
          '*Error logged by Claude Automation System*'
        )
      );
      
      return {
        action: 'system_error',
        criteriaIssue: issue.key,
        error: error.message,
        errorType: 'system_failure'
      };
    }
  }

  async processTestingCriteria(webhookPayload) {
    const issue = webhookPayload.issue;
    
    console.log(`\n--- TESTING CRITERIA PROCESSING ---`);
    console.log(`DEBUG: Processing testing criteria evaluation: ${issue.key}`);
    
    try {
      // Validate this is a legitimate Claude-generated criteria issue
      if (!this.validateClaudeGeneratedCriteria(issue)) {
        throw new Error('Testing criteria must be Claude-generated deliverable criteria to proceed with evaluation');
      }

      // Extract original issue key from summary
      const originalKey = this.extractOriginalIssueKey(issue.fields.summary, issue.fields.description);
      if (!originalKey) {
        throw new Error('Could not extract original issue key from deliverable criteria');
      }

      console.log(`DEBUG: Original issue: ${originalKey}`);
      console.log(`DEBUG: Criteria issue: ${issue.key}`);
      
      // Check stage progression
      const highestStage = this.getHighestStageCompleted(issue);
      const hasForceRetest = this.hasOverrideLabel ? this.hasOverrideLabel(issue, 'retest') : false;
      
      if (highestStage === 'tested' && !hasForceRetest) {
        console.log(`Skipping testing - already completed`);
        
        await this.jiraApi.addComment(
          issue.key,
          this.jiraApi.formatComment(
            'Testing Skipped',
            `Testing was skipped because it has already been completed.\n\nTo force re-evaluation, add the label \`claude-force-retest\` and try again.`,
            '*Skipped by Claude Testing Evaluation System*'
          )
        );
        
        return { 
          action: 'skipped', 
          reason: 'Testing already completed',
          criteriaIssue: issue.key,
          originalIssue: originalKey
        };
      }

      // Remove override label if present
      if (hasForceRetest && this.removeOverrideLabel) {
        try {
          await this.removeOverrideLabel(issue.key, 'retest');
        } catch (labelError) {
          console.error('Failed to remove override label:', labelError.message);
        }
      }

      // Step 1: Load the implementation result from the file system
      console.log('DEBUG: Step 1 - Loading implementation artifacts...');
      let implementationResult;
      
      try {
        implementationResult = await this.loadImplementationResult(originalKey);
        console.log('DEBUG: Implementation loaded successfully');
        console.log('DEBUG: Implementation type:', implementationResult.implementation.type);
      } catch (loadError) {
        console.error('DEBUG: Failed to load implementation:', loadError.message);
        
        await this.jiraApi.addComment(
          issue.key,
          this.jiraApi.formatComment(
            'Testing Evaluation - ERROR',
            `Unable to load implementation artifacts for evaluation:\n\n\`${loadError.message}\`\n\nPlease ensure the implementation has been generated first by moving the issue to "Ready for Implementation".\n\n**Repository Location:** \`work-items/${originalKey}/\``,
            '*Error logged by Claude Testing Evaluation System*'
          )
        );
        
        return {
          action: 'evaluation_failed',
          criteriaIssue: issue.key,
          originalIssue: originalKey,
          error: loadError.message,
          errorType: 'implementation_not_found'
        };
      }
      
      // Step 2: Perform Claude evaluation
      console.log('DEBUG: Step 2 - Calling Claude for testing evaluation...');
      let evaluationResult;
      
      try {
        evaluationResult = await this.testingEvaluator.evaluateImplementation(
          issue,
          originalKey,
          implementationResult
        );
        
        console.log('DEBUG: Evaluation successful');
        console.log('DEBUG: Overall score:', evaluationResult.finalScore.overallScore);
        console.log('DEBUG: Error count:', evaluationResult.finalScore.errorCount);
        console.log('DEBUG: Meets criteria:', evaluationResult.finalScore.meetsCriteria);
        
      } catch (evaluationError) {
        console.error('DEBUG: Evaluation failed:', evaluationError.message);
        
        // Report evaluation failure to Jira
        await this.jiraApi.addComment(
          issue.key,
          this.jiraApi.formatComment(
            'Testing Evaluation - ERROR',
            `An error occurred during automated testing evaluation:\n\n\`${evaluationError.message}\`\n\nThis may indicate:\n• Implementation artifacts are missing or corrupted\n• Deliverable criteria format issues\n• Claude API communication problems\n\nPlease check the implementation artifacts and try again, or proceed with manual evaluation.\n\n**Repository Location:** \`work-items/${originalKey}/\``,
            '*Error logged by Claude Testing Evaluation System*'
          )
        );
        
        return {
          action: 'evaluation_failed',
          criteriaIssue: issue.key,
          originalIssue: originalKey,
          error: evaluationError.message,
          errorType: 'claude_evaluation_failure'
        };
      }
      
      // Step 3: Save evaluation results
      console.log('DEBUG: Step 3 - Saving evaluation results...');
      try {
        await this.saveEvaluationResults(originalKey, evaluationResult);
      } catch (saveError) {
        console.error('Failed to save evaluation results:', saveError.message);
        // Continue even if saving fails
      }
      
      // Step 4: Update stage label regardless of pass/fail (FIXED)
      try {
        await this.updateStageLabel(issue.key, 'tested');
      } catch (labelError) {
        console.error('Failed to update stage label, but continuing:', labelError.message);
      }
      
      // Step 5: Update Jira based on evaluation outcome
      if (evaluationResult.finalScore.meetsCriteria) {
        console.log('DEBUG: Step 5a - Implementation PASSED evaluation');
        
        // Report success
        const usageInstructions = this.testingEvaluator.generateUsageInstructions(
          evaluationResult.implementationType,
          {},
          evaluationResult.evaluation
        );
        
        await this.jiraApi.addComment(
          issue.key,
          this.jiraApi.formatComment(
            'Testing Evaluation - PASSED',
            `Claude has successfully evaluated the implementation and it **PASSES** all criteria.

  **Final Score: ${evaluationResult.finalScore.overallScore}/100** ✅
  - Requirements Coverage: ${evaluationResult.finalScore.breakdown.requirementsCoverage}/25
  - Quality & Craftsmanship: ${evaluationResult.finalScore.breakdown.qualityCraftsmanship}/25  
  - Usability & Practicality: ${evaluationResult.finalScore.breakdown.usabilityPracticality}/25
  - Completeness & Polish: ${evaluationResult.finalScore.breakdown.completenessPolish}/25

  **Error Analysis: ${evaluationResult.finalScore.errorCount} errors found**

  **Implementation Type:** ${evaluationResult.implementationType}

  ${usageInstructions}

  **Repository Location:** \`work-items/${originalKey}/\`
  **Evaluation Report:** \`work-items/${originalKey}/evaluation/evaluation-summary.md\``,
            '*Generated by Claude Testing Evaluation System*'
          )
        );
        
        // Update to completion status
        await this.updateToCompletionStatus(issue.key, originalKey, evaluationResult);
        
        return {
          action: 'evaluation_passed',
          criteriaIssue: issue.key,
          originalIssue: originalKey,
          evaluationResult: evaluationResult,
          nextStatus: this.getCompletionStatus(evaluationResult.implementationType)
        };
        
      } else {
        console.log('DEBUG: Step 5b - Implementation FAILED evaluation');
        
        const score = evaluationResult.finalScore;
        await this.jiraApi.addComment(
          issue.key,
          this.jiraApi.formatComment(
            'Testing Evaluation - FAILED',
            `Claude has evaluated the implementation and it **FAILS** to meet criteria.

  **Final Score: ${score.overallScore}/100** ❌ (Required: ${score.passingScore}/100)
  - Requirements Coverage: ${score.breakdown.requirementsCoverage}/25
  - Quality & Craftsmanship: ${score.breakdown.qualityCraftsmanship}/25  
  - Usability & Practicality: ${score.breakdown.usabilityPracticality}/25
  - Completeness & Polish: ${score.breakdown.completenessPolish}/25

  **Error Analysis: ${score.errorCount} errors found** (${score.criticalErrors} critical, ${score.highErrors} high)

  **Critical Issues:**
  ${evaluationResult.evaluation.errors.filter(e => e.severity === 'CRITICAL').map(error => 
    `• **${error.type}:** ${error.description}`
  ).join('\n') || 'No critical issues'}

  **Repository Location:** \`work-items/${originalKey}/\`
  **Detailed Report:** \`work-items/${originalKey}/evaluation/evaluation-summary.md\`

  Please address the identified issues and re-submit for evaluation.`,
            '*Generated by Claude Testing Evaluation System*'
          )
        );
        
        return {
          action: 'evaluation_failed',
          criteriaIssue: issue.key,
          originalIssue: originalKey,
          evaluationResult: evaluationResult,
          failureReasons: evaluationResult.recommendation.criticalIssues || []
        };
      }

    } catch (error) {
      console.error(`DEBUG: Failed to process testing criteria ${issue.key}:`, error);
      
      // Generic failure handling
      await this.jiraApi.addComment(
        issue.key,
        this.jiraApi.formatComment(
          'Testing Evaluation System Error',
          `A system error occurred during testing evaluation:\n\n\`${error.message}\`\n\nPlease check the system logs and try again, or proceed with manual evaluation.`,
          '*Error logged by Claude Testing Evaluation System*'
        )
      );
      
      return {
        action: 'system_error',
        criteriaIssue: issue.key,
        error: error.message,
        errorType: 'system_failure'
      };
    }
  }

  isValidWebhookEvent(webhookPayload) {
    console.log(`Validating webhook event: ${webhookPayload.webhookEvent}`);
    
    // Only process specific webhook events
    const supportedEvents = [
      'jira:issue_created',
      'jira:issue_updated'
    ];

    if (!supportedEvents.includes(webhookPayload.webhookEvent)) {
      console.log(`Unsupported event type: ${webhookPayload.webhookEvent}`);
      return false;
    }

    // Must have issue data
    if (!webhookPayload.issue || !webhookPayload.issue.key) {
      console.log(`Missing issue data in webhook payload`);
      return false;
    }

    const issue = webhookPayload.issue;
    const issueType = issue.fields.issuetype.name;
    const status = issue.fields.status.name;

    console.log(`Issue: ${issue.key}, Type: ${issueType}, Status: ${status}`);

    // Only process Stories and Tasks
    if (!['Story', 'Task'].includes(issueType)) {
      console.log(`Issue type '${issueType}' not supported for automation`);
      return false;
    }

    // For updated events, only proceed if it's a meaningful status change
    if (webhookPayload.webhookEvent === 'jira:issue_updated') {
      // Check if this was a status change
      const changelog = webhookPayload.changelog;
      const isStatusChange = changelog?.items?.some(item => item.field === 'status');
      
      if (!isStatusChange) {
        console.log(`Updated event but no status change - ignoring`);
        return false;
      }

      // For deliverable criteria issues moving to ready state
      const summary = issue.fields.summary || '';
      if (summary.includes('Deliverable Criteria:')) {
        const actionableStatuses = ['Ready for Implementation', 'In Progress', 'Ready for Development', 'Testing Criteria'];
        if (!actionableStatuses.includes(status)) {
          console.log(`Deliverable criteria issue not in actionable status: ${status}`);
          return false;
        }
      } else {
        // For regular issues, we typically don't care about status updates
        console.log(`Regular issue status update - ignoring`);
        return false;
      }
    }

    console.log(`Webhook event validated successfully`);
    return true;
  }

  classifyIssueType(webhookPayload) {
    const issue = webhookPayload.issue;
    const summary = issue.fields.summary || '';
    const description = issue.fields.description || '';
    const status = issue.fields.status.name;
    
    console.log(`\n--- CLASSIFICATION DEBUG ---`);
    console.log(`DEBUG: Classifying issue: ${issue.key}`);
    console.log(`DEBUG: Summary: "${summary}"`);
    console.log(`DEBUG: Status: ${status}`);
    console.log(`DEBUG: Description preview: "${description.substring(0, 100)}${description.length > 100 ? '...' : ''}"`);
    console.log(`DEBUG: Issue type: ${issue.fields.issuetype.name}`);
    
    // Check for Claude markers (most computationally efficient first)
    const hasClaudeMarker = this.hasClaudeMarkers(summary, description);
    console.log(`DEBUG: Has Claude markers: ${hasClaudeMarker}`);
    
    if (!hasClaudeMarker) {
      console.log('Human-created item detected - needs requirements analysis');
      console.log(`DEBUG: Classification result: initial_inquiry`);
      return 'initial_inquiry';
    }
    
    // Claude-touched item - check specific type and status
    if (summary.includes('Deliverable Criteria:')) {
      console.log('Deliverable criteria detected');
      
      // Check if it's in testing status
      if (status === 'Testing Criteria') {
        console.log('Deliverable criteria moved to testing - ready for evaluation');
        console.log(`DEBUG: Classification result: testing_criteria`);
        return 'testing_criteria';
      }
      
      // Check if ready for implementation
      if (this.isReadyForImplementation(webhookPayload)) {
        console.log('Deliverable criteria ready for implementation');
        console.log(`DEBUG: Classification result: deliverable_criteria`);
        return 'deliverable_criteria';
      } else {
        console.log('Deliverable criteria not ready for implementation');
        console.log(`DEBUG: Classification result: ignore`);
        return 'ignore';
      }
    }
    
    console.log('Claude-touched item but not actionable');
    console.log(`DEBUG: Classification result: ignore`);
    return 'ignore';
  }

  hasClaudeMarkers(summary, description) {
    const claudeMarkers = [
      'Claude Generated',
      '*Touched by Claude*',
      'Deliverable Criteria:',
      'Implementation:',
      '*Generated by Claude Automation System*'
    ];
    
    console.log(`DEBUG: Checking for Claude markers...`);
    console.log(`DEBUG: Summary check: "${summary}"`);
    console.log(`DEBUG: Description check: "${description.substring(0, 200)}..."`);
    
    for (const marker of claudeMarkers) {
      const inSummary = summary.includes(marker);
      const inDescription = description.includes(marker);
      console.log(`DEBUG: Marker "${marker}": summary=${inSummary}, description=${inDescription}`);
      
      if (inSummary || inDescription) {
        console.log(`DEBUG: Found Claude marker: "${marker}"`);
        return true;
      }
    }
    
    console.log(`DEBUG: No Claude markers found`);
    return false;
  }

  isReadyForImplementation(webhookPayload) {
    const status = webhookPayload.issue.fields.status.name;
    const readyStatuses = [
      'Ready for Implementation',
      'In Progress', 
      'Ready for Development'
    ];
    
    return readyStatuses.includes(status);
  }

  async processInitialInquiry(webhookPayload) {
    const issue = webhookPayload.issue;
    
    console.log(`\n--- INITIAL INQUIRY PROCESSING ---`);
    console.log(`DEBUG: Processing initial inquiry: ${issue.key}`);
    console.log(`DEBUG: Issue summary: ${issue.fields.summary}`);
    console.log(`DEBUG: Issue description length: ${(issue.fields.description || '').length} characters`);
    
    try {
      // Step 1: Analyze requirements with Claude
      console.log('DEBUG: Step 1 - Calling Claude for requirements analysis...');
      console.log('DEBUG: Claude API Key present:', !!process.env.CLAUDE_API_KEY);
      console.log('DEBUG: Claude API Key length:', process.env.CLAUDE_API_KEY ? process.env.CLAUDE_API_KEY.length : 0);
      
      const analysis = await this.requirementsAnalyzer.analyzeRequirements(issue);
      
      console.log('DEBUG: Step 1 complete - Analysis received');
      console.log('DEBUG: Analysis keys:', Object.keys(analysis));
      console.log('DEBUG: Functional requirements count:', analysis.deliveryCriteria?.functionalRequirements?.length || 0);
      console.log('DEBUG: Technical requirements count:', analysis.deliveryCriteria?.technicalRequirements?.length || 0);
      
      // Step 2: Mark original issue as touched by Claude
      console.log('DEBUG: Step 2 - Marking original issue as touched by Claude...');
      console.log('DEBUG: Jira credentials present:', !!process.env.JIRA_EMAIL, !!process.env.JIRA_API_TOKEN, !!process.env.JIRA_URL);
      
      await this.markIssueAsTouchedByClaude(issue.key, analysis);
      console.log('DEBUG: Step 2 complete - Issue marked as touched');
      
      // Step 3: Create deliverable criteria issue
      console.log('DEBUG: Step 3 - Creating deliverable criteria issue...');
      console.log('DEBUG: Project key extracted:', issue.key.split('-')[0]);
      
      const criteriaIssue = await this.createDeliverableCriteriaIssue(issue, analysis);
      
      console.log('DEBUG: Step 3 complete - Criteria issue created');
      console.log('DEBUG: New criteria issue key:', criteriaIssue.key);
      console.log('DEBUG: New criteria issue URL:', this.jiraApi.getIssueUrl(criteriaIssue.key));
      
      // Step 4: Link the issues
      console.log('DEBUG: Step 4 - Linking issues...');
      await this.jiraApi.linkIssues(issue.key, criteriaIssue.key, 'Relates');
      console.log('DEBUG: Step 4 complete - Issues linked');
      
      console.log(`DEBUG: Initial inquiry processing complete for ${issue.key}`);
      console.log(`DEBUG: Summary - Original: ${issue.key}, Criteria: ${criteriaIssue.key}`);
      
      return {
        action: 'requirements_analyzed',
        originalIssue: issue.key,
        criteriaIssue: criteriaIssue.key,
        analysis: analysis
      };

    } catch (error) {
      console.error(`DEBUG: DETAILED ERROR in processInitialInquiry for ${issue.key}:`);
      console.error(`DEBUG: Error message:`, error.message);
      console.error(`DEBUG: Error name:`, error.name);
      console.error(`DEBUG: Error stack:`, error.stack);
      
      if (error.response) {
        console.error(`DEBUG: HTTP Response status:`, error.response.status);
        console.error(`DEBUG: HTTP Response data:`, error.response.data);
      }
      
      // Add error comment to original issue
      try {
        console.log(`DEBUG: Adding error comment to ${issue.key}...`);
        await this.jiraApi.addComment(
          issue.key,
          this.jiraApi.formatComment(
            'Claude Analysis Failed',
            `An error occurred during automated requirements analysis:\n\n\`${error.message}\`\n\nPlease review and try again, or proceed with manual analysis.`,
            '*Error logged by Claude Automation System*'
          )
        );
        console.log(`DEBUG: Error comment added successfully`);
      } catch (commentError) {
        console.error(`DEBUG: Failed to add error comment:`, commentError.message);
      }
      
      throw error;
    }
  }

  async markIssueAsTouchedByClaude(issueKey, analysis) {
    console.log(`\n--- MARKING ISSUE AS TOUCHED ---`);
    console.log(`DEBUG: Starting to mark issue ${issueKey} as touched by Claude`);
    
    const timestamp = new Date().toISOString();
    console.log(`DEBUG: Timestamp: ${timestamp}`);
    
    try {
      const claudeMarker = `\n\n---\n*Touched by Claude* - Requirements analyzed on ${timestamp}\n\n**Analysis Summary:**\n• ${analysis.deliveryCriteria.functionalRequirements.length} functional requirements identified\n• ${analysis.validationTests.unitTests.length} test scenarios defined\n• Estimated effort: ${analysis.estimatedEffort.storyPoints} story points\n\nDetailed delivery criteria created in linked issue.`;
      
      console.log(`DEBUG: Claude marker content (${claudeMarker.length} chars): ${claudeMarker.substring(0, 100)}...`);
      
      // Get current description and append Claude marker
      console.log(`DEBUG: Fetching current issue ${issueKey} from Jira...`);
      const issue = await this.jiraApi.getIssue(issueKey);
      console.log(`DEBUG: Current issue fetched successfully`);
      console.log(`DEBUG: Current description length: ${(issue.fields.description || '').length} chars`);
      
      const currentDescription = issue.fields.description || '';
      const updatedDescription = currentDescription + claudeMarker;
      
      console.log(`DEBUG: Updated description length: ${updatedDescription.length} chars`);
      console.log(`DEBUG: Updating issue ${issueKey} with Claude marker...`);
      
      await this.jiraApi.updateIssue(issueKey, {
        description: updatedDescription
      });
      
      console.log(`DEBUG: Issue ${issueKey} successfully marked as touched by Claude`);
      
    } catch (error) {
      console.error(`DEBUG: Error marking issue ${issueKey} as touched:`, error.message);
      console.error(`DEBUG: Error stack:`, error.stack);
      throw error;
    }
  }
    // In webhook processor
  getHighestStageCompleted(issue) {
    const labels = issue.fields.labels?.map(label => label.name) || [];
    
    if (labels.includes('claude-stage-tested')) return 'tested';
    if (labels.includes('claude-stage-implemented')) return 'implemented'; 
    if (labels.includes('claude-stage-analyzed')) return 'analyzed';
    return 'none';
  }

  async updateStageLabel(issueKey, newStage) {
    const stageLabels = ['claude-stage-analyzed', 'claude-stage-implemented', 'claude-stage-tested'];
    const newLabel = `claude-stage-${newStage}`;
    
    try {
      const issue = await this.jiraApi.getIssue(issueKey);
      const currentLabels = issue.fields.labels || [];
      
      console.log(`DEBUG: Current labels for ${issueKey}:`, currentLabels);
      
      // Filter out old stage labels, keeping only non-stage labels
      const nonStageLabels = currentLabels.filter(label => {
        const labelName = typeof label === 'string' ? label : label.name;
        return !stageLabels.includes(labelName);
      });
      
      // Add the new stage label - Jira expects just the label name as a string
      const updatedLabels = [...nonStageLabels.map(label => typeof label === 'string' ? label : label.name), newLabel];
      
      console.log(`DEBUG: Updating labels to:`, updatedLabels);
      
      await this.jiraApi.updateIssue(issueKey, {
        labels: updatedLabels
      });
      
      console.log(`Updated stage label for ${issueKey} to ${newLabel}`);
    } catch (error) {
      console.error(`Failed to update stage label: ${error.message}`);
      // Don't rethrow - let the process continue even if labeling fails
    }
  }

  async createDeliverableCriteriaIssue(originalIssue, analysis) {
    console.log(`\n--- CREATING DELIVERABLE CRITERIA ISSUE ---`);
    console.log(`DEBUG: Creating criteria issue for original: ${originalIssue.key}`);
    
    const projectKey = originalIssue.key.split('-')[0];
    const timestamp = new Date().toISOString();
    
    console.log(`DEBUG: Project key extracted: ${projectKey}`);
    console.log(`DEBUG: Timestamp: ${timestamp}`);
    
    // FIXED: Include original issue key in the summary
    const summary = `Deliverable Criteria: ${originalIssue.key} - ${originalIssue.fields.summary}`;
    console.log(`DEBUG: New issue summary (${summary.length} chars): ${summary}`);
    
    try {
      const description = `**Claude Generated Delivery Criteria**
    
**Original Issue:** ${originalIssue.key} - ${originalIssue.fields.summary}
**Analysis Date:** ${timestamp}

## Functional Requirements
${analysis.deliveryCriteria.functionalRequirements.map(req => `• ${req}`).join('\n')}

## Technical Requirements  
${analysis.deliveryCriteria.technicalRequirements.map(req => `• ${req}`).join('\n')}

## Acceptance Criteria
${analysis.deliveryCriteria.acceptanceCriteria.map(criteria => `• ${criteria}`).join('\n')}

## Validation Tests
**Unit Tests:**
${analysis.validationTests.unitTests.map(test => `• ${test}`).join('\n')}

**Integration Tests:**
${analysis.validationTests.integrationTests.map(test => `• ${test}`).join('\n')}

## Technical Approach
**Architecture:** ${analysis.technicalApproach.architecture}
**Components:** ${analysis.technicalApproach.components.join(', ')}
**Dependencies:** ${analysis.technicalApproach.dependencies.join(', ')}

## Definition of Done
${analysis.deliveryCriteria.definitionOfDone.map(item => `• ${item}`).join('\n')}

## Estimated Effort
**Story Points:** ${analysis.estimatedEffort.storyPoints}
**Complexity:** ${analysis.estimatedEffort.complexity}
**Hours:** ${analysis.estimatedEffort.hours}

---
*Generated by Claude Automation System*
**Instructions:** Move this issue to "Ready for Implementation" to trigger automated development.`;

      console.log(`DEBUG: Description generated (${description.length} chars)`);
      console.log(`DEBUG: Description preview: ${description.substring(0, 200)}...`);
      
      console.log(`DEBUG: Analysis data validation:`);
      console.log(`  - Functional requirements: ${analysis.deliveryCriteria.functionalRequirements?.length || 0}`);
      console.log(`  - Technical requirements: ${analysis.deliveryCriteria.technicalRequirements?.length || 0}`);
      console.log(`  - Acceptance criteria: ${analysis.deliveryCriteria.acceptanceCriteria?.length || 0}`);
      console.log(`  - Unit tests: ${analysis.validationTests.unitTests?.length || 0}`);
      console.log(`  - Integration tests: ${analysis.validationTests.integrationTests?.length || 0}`);
      
      console.log(`DEBUG: Calling Jira API to create issue...`);
      console.log(`DEBUG: Project: ${projectKey}, Type: Task`);
      
      const newIssue = await this.jiraApi.createIssue(
        projectKey,
        'Task',
        summary,
        description
      );
      
      console.log(`DEBUG: Jira API call successful`);
      console.log(`DEBUG: New issue created: ${newIssue.key}`);
      console.log(`DEBUG: New issue ID: ${newIssue.id}`);
      console.log(`DEBUG: New issue URL: ${this.jiraApi.getIssueUrl(newIssue.key)}`);
      
      return newIssue;
      
    } catch (error) {
      console.error(`DEBUG: Error creating deliverable criteria issue:`);
      console.error(`  - Error message: ${error.message}`);
      console.error(`  - Error name: ${error.name}`);
      console.error(`  - Error stack: ${error.stack}`);
      
      if (error.response) {
        console.error(`  - HTTP status: ${error.response.status}`);
        console.error(`  - HTTP data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      
      throw error;
    }
  }

  validateClaudeGeneratedCriteria(issue) {
    const summary = issue.fields.summary || '';
    const description = issue.fields.description || '';
    
    // Must have deliverable criteria marker
    if (!summary.includes('Deliverable Criteria:')) {
      return false;
    }
    
    // Must have Claude generation marker
    if (!description.includes('*Generated by Claude Automation System*')) {
      return false;
    }
    
    return true;
  }

  extractOriginalIssueKey(summary, description) {
    console.log(`DEBUG: Extracting original issue key from summary: "${summary}"`);
    
    if (summary) {
      // Try project-specific pattern first (this worked in the logs)
      const projectSpecificMatch = summary.match(/(PCP1-\d+)/);
      if (projectSpecificMatch) {
        const key = projectSpecificMatch[1];
        console.log(`DEBUG: Found original key with project-specific pattern: ${key}`);
        return key;
      }
      
      // Try generic pattern for other projects
      const genericMatch = summary.match(/([A-Z]{2,}-\d+)/);
      if (genericMatch) {
        const key = genericMatch[1];
        console.log(`DEBUG: Found original key with generic pattern: ${key}`);
        return key;
      }
      
      // Try more permissive pattern
      const permissiveMatch = summary.match(/([A-Za-z]+\d*-\d+)/);
      if (permissiveMatch) {
        const key = permissiveMatch[1];
        console.log(`DEBUG: Found original key with permissive pattern: ${key}`);
        return key;
      }
    }
    
    // Fallback to description
    console.log(`DEBUG: No key found in summary, trying description fallback...`);
    if (description) {
      const descMatch = description.match(/\*\*Original Issue:\*\* ([A-Z]+-\d+)/);
      if (descMatch) {
        const key = descMatch[1];
        console.log(`DEBUG: Found original key in description: ${key}`);
        return key;
      }
    }
    
    console.log(`DEBUG: Could not extract original issue key from summary or description`);
    return null;
  }

  extractRequirementsFromCriteria(criteriaIssue) {
    // Parse the structured requirements from the criteria issue description
    const description = criteriaIssue.fields.description || '';
    
    return {
      functionalRequirements: this.extractSection(description, 'Functional Requirements'),
      technicalRequirements: this.extractSection(description, 'Technical Requirements'),
      acceptanceCriteria: this.extractSection(description, 'Acceptance Criteria'),
      validationTests: this.extractSection(description, 'Validation Tests'),
      definitionOfDone: this.extractSection(description, 'Definition of Done')
    };
  }

  extractSection(text, sectionName) {
    const regex = new RegExp(`## ${sectionName}([\\s\\S]*?)(?=##|$)`, 'i');
    const match = text.match(regex);
    if (!match) return [];
    
    return match[1]
      .split('\n')
      .filter(line => line.trim().startsWith('•'))
      .map(line => line.replace('•', '').trim());
  }

  async createImplementationArtifacts(originalKey, implementationResult) {
    console.log(`\n--- CREATING IMPLEMENTATION ARTIFACTS ---`);
    console.log(`DEBUG: Creating implementation artifacts for ${originalKey}`);
    console.log(`DEBUG: Implementation type: ${implementationResult.implementation.type}`);
    
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const implementation = implementationResult.implementation;
      
      // Create directory structure
      const workItemsDir = path.join(process.cwd(), 'work-items', originalKey);
      const implementationDir = path.join(workItemsDir, 'implementation');
      
      console.log(`DEBUG: Work items directory: ${workItemsDir}`);
      console.log(`DEBUG: Implementation directory: ${implementationDir}`);
      
      // Ensure directories exist
      console.log(`DEBUG: Creating directory structure...`);
      await fs.mkdir(workItemsDir, { recursive: true });
      await fs.mkdir(implementationDir, { recursive: true });
      console.log(`DEBUG: Directories created successfully`);
      
      // Create implementation files based on type
      const timestamp = new Date().toISOString();
      const createdFiles = [];
      
      // 1. Primary deliverable file
      console.log(`DEBUG: Writing primary deliverable...`);
      const primaryFile = this.getPrimaryFileName(implementation.type);
      const primaryPath = path.join(implementationDir, primaryFile);
      await fs.writeFile(primaryPath, implementation.primaryDeliverable, 'utf8');
      createdFiles.push(primaryFile);
      console.log(`DEBUG: Primary deliverable written to: ${primaryPath} (${implementation.primaryDeliverable.length} chars)`);
      
      // 2. Supporting files (if any)
      if (implementation.supportingFiles && Object.keys(implementation.supportingFiles).length > 0) {
        console.log(`DEBUG: Writing ${Object.keys(implementation.supportingFiles).length} supporting files...`);
        for (const [filename, content] of Object.entries(implementation.supportingFiles)) {
          const supportingPath = path.join(implementationDir, filename);
          await fs.writeFile(supportingPath, content, 'utf8');
          createdFiles.push(filename);
          console.log(`DEBUG: Supporting file written: ${filename} (${content.length} chars)`);
        }
      }
      
      // 3. Validation/tests file
      if (implementationResult.tests && implementationResult.tests.content) {
        console.log(`DEBUG: Writing validation file...`);
        const testFile = this.getValidationFileName(implementation.type);
        const testPath = path.join(implementationDir, testFile);
        await fs.writeFile(testPath, implementationResult.tests.content, 'utf8');
        createdFiles.push(testFile);
        console.log(`DEBUG: Validation file written to: ${testPath} (${implementationResult.tests.content.length} chars)`);
      }
      
      // 4. Documentation file
      if (implementationResult.documentation) {
        console.log(`DEBUG: Writing documentation file...`);
        const docsPath = path.join(implementationDir, 'README.md');
        await fs.writeFile(docsPath, implementationResult.documentation, 'utf8');
        createdFiles.push('README.md');
        console.log(`DEBUG: Documentation written to: ${docsPath} (${implementationResult.documentation.length} chars)`);
      }
      
      // 5. Implementation summary file
      console.log(`DEBUG: Creating implementation summary...`);
      const summaryContent = this.generateImplementationSummary(originalKey, implementationResult, timestamp);
      const summaryPath = path.join(implementationDir, 'implementation-summary.md');
      await fs.writeFile(summaryPath, summaryContent, 'utf8');
      createdFiles.push('implementation-summary.md');
      console.log(`DEBUG: Implementation summary written to: ${summaryPath}`);
      
      // 6. Create configuration file based on implementation type
      if (this.shouldCreateConfigFile(implementation.type)) {
        console.log(`DEBUG: Creating configuration file...`);
        const configContent = this.generateConfigFile(originalKey, implementation, timestamp);
        const configFile = this.getConfigFileName(implementation.type);
        const configPath = path.join(implementationDir, configFile);
        await fs.writeFile(configPath, configContent, 'utf8');
        createdFiles.push(configFile);
        console.log(`DEBUG: Configuration file written to: ${configPath}`);
      }
      
      console.log(`DEBUG: Implementation artifacts created successfully:`);
      createdFiles.forEach(file => {
        console.log(`  - ${file}`);
      });
      
      // Verify files were created
      console.log(`DEBUG: Verifying file creation...`);
      for (const file of createdFiles) {
        const filePath = path.join(implementationDir, file);
        try {
          const stats = await fs.stat(filePath);
          console.log(`DEBUG: ✓ ${file} (${stats.size} bytes)`);
        } catch (error) {
          console.error(`DEBUG: ✗ ${file} - Failed to verify: ${error.message}`);
          throw new Error(`Failed to create ${file}`);
        }
      }
      
      console.log(`DEBUG: All implementation artifacts verified successfully`);
      
      return {
        directory: implementationDir,
        files: createdFiles,
        implementationType: implementation.type,
        summary: {
          primaryDeliverableSize: implementation.primaryDeliverable.length,
          supportingFilesCount: implementation.supportingFiles ? Object.keys(implementation.supportingFiles).length : 0,
          validationSize: implementationResult.tests?.content?.length || 0,
          documentationSize: implementationResult.documentation?.length || 0,
          validationPassed: implementationResult.validationResults.passed,
          overallScore: implementationResult.validationResults.overallScore,
          timestamp: timestamp
        }
      };
      
    } catch (error) {
      console.error(`DEBUG: Error creating implementation artifacts for ${originalKey}:`);
      console.error(`  - Error message: ${error.message}`);
      console.error(`  - Error name: ${error.name}`);
      console.error(`  - Error stack: ${error.stack}`);
      
      if (error.code) {
        console.error(`  - Error code: ${error.code}`);
      }
      
      throw new Error(`Failed to create implementation artifacts: ${error.message}`);
    }
  }
  // Helper method to load implementation result from filesystem
  async loadImplementationResult(originalKey) {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const summaryPath = path.join(process.cwd(), 'work-items', originalKey, 'implementation', 'implementation-summary.md');
      const summaryExists = await fs.access(summaryPath).then(() => true).catch(() => false);
      
      if (!summaryExists) {
        throw new Error(`Implementation summary not found for ${originalKey}`);
      }
      
      // Load key files to reconstruct implementation result
      const implementationDir = path.join(process.cwd(), 'work-items', originalKey, 'implementation');
      const files = await fs.readdir(implementationDir);
      
      // Determine implementation type from files
      let implementationType = 'other';
      if (files.includes('solution.js')) implementationType = 'code';
      else if (files.includes('document.md')) implementationType = 'documentation';
      else if (files.includes('analysis.md')) implementationType = 'analysis';
      else if (files.includes('process.md')) implementationType = 'process';
      
      // Load primary deliverable
      const primaryFile = this.getPrimaryFileForType(implementationType);
      const primaryPath = path.join(implementationDir, primaryFile);
      const primaryContent = await fs.readFile(primaryPath, 'utf8');
      
      // Reconstruct implementation result structure
      const implementationResult = {
        implementation: {
          type: implementationType,
          title: `Implementation for ${originalKey}`,
          description: `Auto-loaded implementation from filesystem`,
          primaryDeliverable: primaryContent,
          supportingFiles: {},
          usageInstructions: `See README.md for usage instructions`,
          dependencies: [],
          configurationOptions: {},
          validationCriteria: []
        },
        metadata: {
          originalIssue: originalKey,
          loadedAt: new Date().toISOString()
        }
      };
      
      console.log(`DEBUG: Implementation result loaded for ${originalKey}`);
      return implementationResult;
      
    } catch (error) {
      console.error(`Failed to load implementation result for ${originalKey}:`, error.message);
      throw error;
    }
  }

  getPrimaryFileForType(implementationType) {
    const fileMap = {
      'code': 'solution.js',
      'documentation': 'document.md',
      'analysis': 'analysis.md',
      'process': 'process.md',
      'other': 'implementation.txt'
    };
    return fileMap[implementationType] || 'implementation.txt';
  }

  // Save evaluation results to filesystem
  async saveEvaluationResults(originalKey, evaluationResult) {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const evaluationDir = path.join(process.cwd(), 'work-items', originalKey, 'evaluation');
      await fs.mkdir(evaluationDir, { recursive: true });
      
      // Save detailed evaluation results
      const evaluationPath = path.join(evaluationDir, 'evaluation-results.json');
      await fs.writeFile(evaluationPath, JSON.stringify(evaluationResult, null, 2), 'utf8');
      
      // Create evaluation summary report
      const summaryReport = this.generateEvaluationSummaryReport(originalKey, evaluationResult);
      const reportPath = path.join(evaluationDir, 'evaluation-summary.md');
      await fs.writeFile(reportPath, summaryReport, 'utf8');
      
      console.log(`DEBUG: Evaluation results saved to ${evaluationDir}`);
      
    } catch (error) {
      console.error(`Failed to save evaluation results:`, error.message);
      throw error;
    }
  }

  generateEvaluationSummaryReport(originalKey, evaluationResult) {
    const score = evaluationResult.finalScore;
    const evaluation = evaluationResult.evaluation;
    
    return `# Testing Evaluation Report - ${originalKey}

  **Evaluation Date:** ${evaluationResult.evaluatedAt}
  **Implementation Type:** ${evaluationResult.implementationType}
  **Final Result:** ${score.meetsCriteria ? '✅ PASSED' : '❌ FAILED'}

  ## Overall Score: ${score.overallScore}/100

  ### Score Breakdown
  - **Requirements Coverage:** ${score.breakdown.requirementsCoverage}/25
  - **Quality & Craftsmanship:** ${score.breakdown.qualityCraftsmanship}/25  
  - **Usability & Practicality:** ${score.breakdown.usabilityPracticality}/25
  - **Completeness & Polish:** ${score.breakdown.completenessPolish}/25

  ### Error Analysis
  - **Total Errors:** ${score.errorCount}
  - **Critical Errors:** ${score.criticalErrors}
  - **High Priority Errors:** ${score.highErrors}

  ${score.errorCount > 0 ? `
  ### Identified Errors
  ${evaluation.errors.map(error => `
  **${error.severity} - ${error.type}**
  - Description: ${error.description}
  - Impact: ${error.impact}
  - Recommendation: ${error.recommendation}
  `).join('\n')}
  ` : '**No errors identified**'}

  ## Detailed Analysis

  ### Requirements Coverage
  ${evaluation.requirementsCoverage.analysis}

  **Covered Requirements:**
  ${evaluation.requirementsCoverage.coveredRequirements.map(req => `- ${req}`).join('\n')}

  **Missed Requirements:**
  ${evaluation.requirementsCoverage.missedRequirements.map(req => `- ${req}`).join('\n')}

  ### Quality & Craftsmanship
  ${evaluation.qualityCraftsmanship.analysis}

  ### Usability & Practicality
  ${evaluation.usabilityPracticality.analysis}

  ### Completeness & Polish
  ${evaluation.completenessPolish.analysis}

  ## Overall Assessment
  ${evaluation.overallAssessment.summary}

  **Ready for Deployment:** ${evaluation.overallAssessment.readyForDeployment ? 'Yes' : 'No'}

  ### Recommendations
  ${evaluation.overallAssessment.recommendations.map(rec => `- ${rec}`).join('\n')}

  ---
  *Generated by Claude Testing Evaluation System*`;
  }

  // Report successful evaluation to Jira
  async reportEvaluationSuccess(criteriaIssueKey, originalKey, evaluationResult) {
    console.log(`DEBUG: Reporting evaluation success for ${criteriaIssueKey}`);
    
    const score = evaluationResult.finalScore;
    const usageInstructions = this.testingEvaluator.generateUsageInstructions(
      evaluationResult.implementationType,
      {}, // We'd need to load artifacts here if needed for instructions
      evaluationResult.evaluation
    );
    
    const successComment = this.jiraApi.formatComment(
      'Testing Evaluation - PASSED',
      `Claude has successfully evaluated the implementation and it **PASSES** all criteria.

  **Final Score: ${score.overallScore}/100** ✅
  - Requirements Coverage: ${score.breakdown.requirementsCoverage}/25
  - Quality & Craftsmanship: ${score.breakdown.qualityCraftsmanship}/25  
  - Usability & Practicality: ${score.breakdown.usabilityPracticality}/25
  - Completeness & Polish: ${score.breakdown.completenessPolish}/25

  **Error Analysis: ${score.errorCount} errors found** (${score.criticalErrors} critical, ${score.highErrors} high)

  **Overall Assessment:** ${evaluationResult.evaluation.overallAssessment.summary}

  **Implementation Type:** ${evaluationResult.implementationType}

  ${usageInstructions}

  **Next Steps:**
  ${evaluationResult.recommendation.nextSteps.map(step => `• ${step}`).join('\n')}

  **Repository Location:** \`work-items/${originalKey}/\`
  **Evaluation Report:** \`work-items/${originalKey}/evaluation/evaluation-summary.md\``,
      '*Generated by Claude Testing Evaluation System*'
    );
    
    await this.jiraApi.addComment(criteriaIssueKey, successComment);
  }

  // Report evaluation failure to Jira
  async reportEvaluationFailure(criteriaIssueKey, originalKey, error, evaluationResult = null) {
    console.log(`DEBUG: Reporting evaluation failure for ${criteriaIssueKey}`);
    
    if (evaluationResult) {
      // Evaluation completed but failed criteria
      const score = evaluationResult.finalScore;
      
      const failureComment = this.jiraApi.formatComment(
        'Testing Evaluation - FAILED',
        `Claude has evaluated the implementation and it **FAILS** to meet criteria.

  **Final Score: ${score.overallScore}/100** ❌ (Required: ${score.passingScore}/100)
  - Requirements Coverage: ${score.breakdown.requirementsCoverage}/25
  - Quality & Craftsmanship: ${score.breakdown.qualityCraftsmanship}/25  
  - Usability & Practicality: ${score.breakdown.usabilityPracticality}/25
  - Completeness & Polish: ${score.breakdown.completenessPolish}/25

  **Error Analysis: ${score.errorCount} errors found** (${score.criticalErrors} critical, ${score.highErrors} high)

  **Critical Issues:**
  ${evaluationResult.evaluation.errors.filter(e => e.severity === 'CRITICAL').map(error => 
    `• **${error.type}:** ${error.description}`
  ).join('\n') || 'No critical issues'}

  **Major Concerns:**
  ${evaluationResult.evaluation.overallAssessment.majorConcerns.map(concern => `• ${concern}`).join('\n')}

  **Recommendations for Improvement:**
  ${evaluationResult.recommendation.nextSteps.map(step => `• ${step}`).join('\n')}

  **Repository Location:** \`work-items/${originalKey}/\`
  **Detailed Report:** \`work-items/${originalKey}/evaluation/evaluation-summary.md\`

  Please address the identified issues and re-submit for evaluation.`,
        '*Generated by Claude Testing Evaluation System*'
      );
      
      await this.jiraApi.addComment(criteriaIssueKey, failureComment);
      
    } else {
      // Evaluation process itself failed
      const errorComment = this.jiraApi.formatComment(
        'Testing Evaluation - ERROR',
        `An error occurred during automated testing evaluation:

  \`${error.message}\`

  This may indicate:
  • Implementation artifacts are missing or corrupted
  • Deliverable criteria format issues  
  • Claude API communication problems

  Please check the implementation artifacts and try again, or proceed with manual evaluation.

  **Repository Location:** \`work-items/${originalKey}/\``,
        '*Error logged by Claude Testing Evaluation System*'
      );
      
      await this.jiraApi.addComment(criteriaIssueKey, errorComment);
    }
  }

  // Update issue status to completion with deliverable type
  async updateToCompletionStatus(criteriaIssueKey, originalKey, evaluationResult) {
    console.log(`DEBUG: Updating to completion status for ${criteriaIssueKey}`);
    
    const completionStatus = this.getCompletionStatus(evaluationResult.implementationType);
    const usageInstructions = this.testingEvaluator.generateUsageInstructions(
      evaluationResult.implementationType,
      {},
      evaluationResult.evaluation
    );
    
    try {
      // Try to transition to the completion status
      const transitions = await this.jiraApi.getAvailableTransitions(criteriaIssueKey);
      const completionTransition = transitions.find(t => t.name === completionStatus);
      
      if (completionTransition) {
        await this.jiraApi.transitionIssue(criteriaIssueKey, completionTransition.id);
        console.log(`DEBUG: Transitioned ${criteriaIssueKey} to ${completionStatus}`);
      } else {
        console.log(`DEBUG: Completion status ${completionStatus} not available, updating summary instead`);
        
        // Update the summary to include completion info
        const currentIssue = await this.jiraApi.getIssue(criteriaIssueKey);
        const newSummary = `✅ ${completionStatus}: ${currentIssue.fields.summary}`;
        
        await this.jiraApi.updateIssue(criteriaIssueKey, {
          summary: newSummary,
          description: currentIssue.fields.description + `\n\n---\n**COMPLETED - ${completionStatus}**\n${usageInstructions}\n\n*Updated by Claude Testing Evaluation System*`
        });
      }
      
    } catch (error) {
      console.error(`Failed to update completion status: ${error.message}`);
      // Add comment with completion info instead
      await this.jiraApi.addComment(
        criteriaIssueKey,
        this.jiraApi.formatComment(
          `Implementation Complete - ${completionStatus}`,
          `Implementation has passed all testing criteria and is ready for use.

  ${usageInstructions}`,
          '*Generated by Claude Testing Evaluation System*'
        )
      );
    }
  }

  getCompletionStatus(implementationType) {
    const statusMap = {
      'code': 'Code Complete',
      'documentation': 'Documentation Complete', 
      'analysis': 'Analysis Complete',
      'process': 'Process Complete',
      'other': 'Implementation Complete'
    };
    return statusMap[implementationType] || 'Implementation Complete';
  }

  // Generic testing failure handler
  async reportGenericTestingFailure(criteriaIssueKey, error) {
    const errorComment = this.jiraApi.formatComment(
      'Testing Evaluation System Error',
      `A system error occurred during testing evaluation:

  \`${error.message}\`

  Please check the system logs and try again, or proceed with manual evaluation.`,
      '*Error logged by Claude Testing Evaluation System*'
    );
    
    await this.jiraApi.addComment(criteriaIssueKey, errorComment);
  }
  getPrimaryFileName(implementationType) {
    const fileNames = {
      'code': 'solution.js',
      'documentation': 'document.md',
      'analysis': 'analysis.md',
      'process': 'process.md',
      'other': 'deliverable.txt'
    };
    return fileNames[implementationType] || 'implementation.txt';
  }

  getValidationFileName(implementationType) {
    const validationFiles = {
      'code': 'tests.js',
      'documentation': 'validation-checklist.md',
      'analysis': 'peer-review-criteria.md',
      'process': 'validation-plan.md',
      'other': 'validation.md'
    };
    return validationFiles[implementationType] || 'validation.md';
  }

  shouldCreateConfigFile(implementationType) {
    return ['code', 'process'].includes(implementationType);
  }

  getConfigFileName(implementationType) {
    const configFiles = {
      'code': 'package.json',
      'process': 'process-config.json'
    };
    return configFiles[implementationType] || 'config.json';
  }

  generateConfigFile(originalKey, implementation, timestamp) {
    if (implementation.type === 'code') {
      return JSON.stringify({
        "name": `${originalKey.toLowerCase()}-implementation`,
        "version": "1.0.0",
        "description": implementation.description || `Implementation for ${originalKey}`,
        "main": "solution.js",
        "scripts": {
          "test": "node tests.js",
          "start": "node solution.js"
        },
        "dependencies": this.convertDependenciesToPackageFormat(implementation.dependencies || []),
        "generated": {
          "by": "Claude Automation System",
          "at": timestamp,
          "originalIssue": originalKey,
          "implementationType": implementation.type
        }
      }, null, 2);
    } else if (implementation.type === 'process') {
      return JSON.stringify({
        "processName": implementation.title,
        "version": "1.0.0",
        "description": implementation.description,
        "configuration": implementation.configurationOptions || {},
        "dependencies": implementation.dependencies || [],
        "validationCriteria": implementation.validationCriteria || [],
        "metadata": {
          "generatedBy": "Claude Automation System",
          "generatedAt": timestamp,
          "originalIssue": originalKey,
          "implementationType": implementation.type
        }
      }, null, 2);
    }
    
    return JSON.stringify({
      "title": implementation.title,
      "type": implementation.type,
      "configuration": implementation.configurationOptions || {},
      "dependencies": implementation.dependencies || [],
      "metadata": {
        "generatedBy": "Claude Automation System",
        "generatedAt": timestamp,
        "originalIssue": originalKey
      }
    }, null, 2);
  }

  convertDependenciesToPackageFormat(dependencies) {
    const packageDeps = {};
    dependencies.forEach(dep => {
      // Simple conversion - in production you might want more sophisticated version handling
      packageDeps[dep] = "^1.0.0";
    });
    return packageDeps;
  }

  generateImplementationSummary(originalKey, implementationResult, timestamp) {
    const implementation = implementationResult.implementation;
    const validation = implementationResult.validationResults;
    
    return `# Implementation Complete - ${originalKey}

**Implementation Date:** ${timestamp}
**Implementation Type:** ${implementation.type}
**Status:** ${validation.passed ? 'PASSED' : 'NEEDS REVIEW'}

## Implementation Details
- **Title:** ${implementation.title}
- **Type:** ${implementation.type}
- **Description:** ${implementation.description || 'No description provided'}

## Generated Artifacts
- **Primary Deliverable:** ${this.getPrimaryFileName(implementation.type)} (${implementation.primaryDeliverable.length} chars)
- **Supporting Files:** ${implementation.supportingFiles ? Object.keys(implementation.supportingFiles).length : 0} files
- **Validation:** ${this.getValidationFileName(implementation.type)} (${implementationResult.tests?.content?.length || 0} chars)
- **Documentation:** README.md (${implementationResult.documentation?.length || 0} chars)

## Quality Assessment
- **Overall Score:** ${validation.overallScore?.toFixed(1)}/10
- **Quality Rating:** ${validation.overall}
- **Validation Status:** ${validation.passed ? 'PASSED' : 'FAILED'}
- **Content Quality:** ${validation.details?.contentQuality?.score}/10
- **Completeness:** ${validation.details?.completeness?.score}/10
- **Usability:** ${validation.details?.usability?.score}/10

## Implementation Characteristics
${this.generateTypeSpecificSummary(implementation, validation)}

## Usage Instructions
${implementation.usageInstructions || 'See README.md for usage instructions'}

## Dependencies
${implementation.dependencies && implementation.dependencies.length > 0 
  ? implementation.dependencies.map(dep => `- ${dep}`).join('\n')
  : 'No external dependencies'}

## Configuration Options
${implementation.configurationOptions && Object.keys(implementation.configurationOptions).length > 0
  ? Object.entries(implementation.configurationOptions).map(([key, desc]) => `- **${key}:** ${desc}`).join('\n')
  : 'No configuration options'}

## Validation Criteria
${implementation.validationCriteria && implementation.validationCriteria.length > 0
  ? implementation.validationCriteria.map(criteria => `- ${criteria}`).join('\n')
  : 'See validation file for criteria'}

## Next Steps
1. Review the generated implementation
2. Run validation procedures: See ${this.getValidationFileName(implementation.type)}
3. Validate against original requirements
4. ${implementation.type === 'code' ? 'Test in development environment' : 'Conduct peer review'}
5. ${implementation.type === 'code' ? 'Deploy to production' : 'Implement in target environment'}

## Workflow Status
- [x] Requirements analyzed
- [x] Delivery criteria created  
- [x] Implementation generated by Claude
- [x] Quality validation completed
- [x] Implementation artifacts created
- [x] Files committed to repository
- [ ] Manual review
- [ ] ${implementation.type === 'code' ? 'Integration testing' : 'Stakeholder approval'}
- [ ] Production deployment/implementation

*Generated by Claude Automation System*`;
  }

  generateTypeSpecificSummary(implementation, validation) {
    switch (implementation.type) {
      case 'code':
        return `### Code Implementation
- **Lines of Code:** ${validation.details?.typeSpecificValidation?.linesOfCode || 'N/A'}
- **Has Error Handling:** ${validation.details?.typeSpecificValidation?.hasErrorHandling ? 'Yes' : 'No'}
- **Has Async Support:** ${validation.details?.typeSpecificValidation?.hasAsyncHandling ? 'Yes' : 'No'}
- **Modular Structure:** ${validation.details?.typeSpecificValidation?.hasModularStructure ? 'Yes' : 'No'}
- **Has Comments:** ${validation.details?.typeSpecificValidation?.hasComments ? 'Yes' : 'No'}`;
        
      case 'documentation':
        return `### Documentation Implementation
- **Word Count:** ${validation.details?.typeSpecificValidation?.wordCount || 'N/A'}
- **Has Structure:** ${validation.details?.typeSpecificValidation?.hasStructure ? 'Yes' : 'No'}
- **Has Examples:** ${validation.details?.typeSpecificValidation?.hasExamples ? 'Yes' : 'No'}
- **Has References:** ${validation.details?.typeSpecificValidation?.hasReferences ? 'Yes' : 'No'}
- **Has Table of Contents:** ${validation.details?.typeSpecificValidation?.hasTOC ? 'Yes' : 'No'}`;
        
      case 'analysis':
        return `### Analysis Implementation
- **Word Count:** ${validation.details?.typeSpecificValidation?.wordCount || 'N/A'}
- **Has Methodology:** ${validation.details?.typeSpecificValidation?.hasMethodology ? 'Yes' : 'No'}
- **Has Findings:** ${validation.details?.typeSpecificValidation?.hasFindings ? 'Yes' : 'No'}
- **Has Recommendations:** ${validation.details?.typeSpecificValidation?.hasRecommendations ? 'Yes' : 'No'}
- **Has Evidence:** ${validation.details?.typeSpecificValidation?.hasEvidence ? 'Yes' : 'No'}`;
        
      case 'process':
        return `### Process Implementation
- **Word Count:** ${validation.details?.typeSpecificValidation?.wordCount || 'N/A'}
- **Has Steps:** ${validation.details?.typeSpecificValidation?.hasSteps ? 'Yes' : 'No'}
- **Has Roles:** ${validation.details?.typeSpecificValidation?.hasRoles ? 'Yes' : 'No'}
- **Has Controls:** ${validation.details?.typeSpecificValidation?.hasControls ? 'Yes' : 'No'}
- **Has Measurement:** ${validation.details?.typeSpecificValidation?.hasMeasurement ? 'Yes' : 'No'}`;
        
      default:
        return `### ${implementation.type} Implementation
- **Content Type:** ${implementation.type}
- **Word Count:** ${validation.details?.typeSpecificValidation?.wordCount || 'N/A'}
- **Has Structure:** ${validation.details?.typeSpecificValidation?.hasStructure ? 'Yes' : 'No'}
- **Is Actionable:** ${validation.details?.typeSpecificValidation?.isActionable ? 'Yes' : 'No'}`;
    }
  }

}

module.exports = JiraWebhookProcessor;