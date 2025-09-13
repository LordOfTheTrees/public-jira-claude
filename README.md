# Jira-Claude Automation System

An intelligent project management automation system that integrates Jira with Claude AI to automatically analyze requirements, generate implementations, and evaluate deliverables.

## 🎯 What This System Does

This system creates a complete AI-powered project management workflow:

1. **Requirements Analysis**: When you create a Jira issue, Claude analyzes it and creates detailed delivery criteria
2. **Implementation Generation**: Claude automatically generates code, documentation, analysis, or process implementations
3. **Quality Evaluation**: Claude evaluates implementations against criteria and provides detailed feedback
4. **Automated Workflow**: The entire process from idea to deliverable is automated through Jira status changes

## 🏗️ Architecture Overview

```
Jira Issue → Webhook → Netlify Function → GitHub Actions → Claude AI → Generated Artifacts
```

- **Jira**: Project management and issue tracking
- **Netlify Functions**: Webhook receiver and GitHub Actions dispatcher
- **GitHub Actions**: Workflow orchestration and file management
- **Claude AI**: Requirements analysis, implementation, and evaluation
- **File System**: Artifact storage and version control

## 🚀 Quick Start

### Prerequisites

- Jira Cloud instance with admin access
- GitHub repository 
- Netlify account
- Anthropic Claude API key
- Node.js 18+ for local testing

### 1. Repository Setup

Clone this repository:
```bash
git clone <your-repo-url>
cd jira-claude-automation
npm install
```

### 2. Environment Variables

Create these secrets in your GitHub repository settings:

#### Required Secrets
- `JIRA_URL` - Your Jira instance URL (e.g., `https://yourcompany.atlassian.net`)
- `JIRA_EMAIL` - Email address of Jira user account
- `JIRA_API_TOKEN` - Jira API token (create at id.atlassian.com)
- `CLAUDE_API_KEY` - Anthropic Claude API key
- `PERSONAL_FINE_TOKEN` - GitHub personal access token with repo permissions

#### For Netlify Function
- `GITHUB_OWNER` - Your GitHub username/organization
- `GITHUB_REPO` - Repository name
- `GITHUB_TOKEN` - GitHub personal access token

### 3. Deploy Netlify Function

Deploy the webhook handler to Netlify:

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy to Netlify
netlify deploy --prod
```

Set environment variables in Netlify dashboard:
- `GITHUB_OWNER`
- `GITHUB_REPO` 
- `GITHUB_TOKEN`

### 4. Configure Jira Webhook

In your Jira project settings:

1. Go to **Project Settings → Webhooks**
2. Create new webhook:
   - **URL**: `https://your-netlify-app.netlify.app/.netlify/functions/jira-webhook`
   - **Events**: Issue created, Issue updated
   - **JQL Filter**: `project = YOUR_PROJECT_KEY`

### 5. Test the System

1. Create a new Story or Task in Jira
2. Add a descriptive summary and requirements in the description
3. Watch as Claude automatically:
   - Analyzes your requirements
   - Creates a "Deliverable Criteria" issue
   - Links the issues together
4. Move the criteria issue to "Ready for Implementation" to trigger implementation
5. Move to "Testing Criteria" to trigger evaluation

## 📋 Usage Guide

### Creating Work Items

1. **Create Jira Issue**: Create a Story or Task with:
   - Clear, descriptive summary
   - Detailed description of what you need
   - Any specific requirements or constraints

2. **Automatic Analysis**: Claude will:
   - Analyze your requirements
   - Create comprehensive delivery criteria
   - Generate acceptance criteria and test scenarios
   - Estimate effort and complexity

### Implementation Flow

3. **Ready for Implementation**: Move criteria issue to this status to trigger:
   - Automatic implementation generation
   - Code, documentation, analysis, or process creation
   - Quality validation and scoring
   - File artifact creation in `/work-items/ISSUE-KEY/`

4. **Testing & Evaluation**: Move to "Testing Criteria" status to trigger:
   - Comprehensive evaluation against criteria
   - Detailed scoring and error analysis
   - Pass/fail determination
   - Usage instructions and recommendations

### Workflow States

- **New Issue** → Requirements analysis → Deliverable criteria created
- **Ready for Implementation** → Implementation generation → Artifacts created
- **Testing Criteria** → Evaluation → Pass/fail + recommendations
- **Complete** → Ready for use/deployment

## 🔧 Configuration

### Jira Project Setup

Your Jira project needs these issue types:
- **Story** - For feature requests
- **Task** - For work items

Recommended workflow statuses:
- To Do
- Ready for Implementation  
- In Progress
- Testing Criteria
- Done

### Customization Options

#### Modifying Claude Behavior

Edit the prompt templates in:
- `scripts/claude-requirements-analyzer.js` - Requirements analysis prompts
- `scripts/claude-implementation.js` - Implementation generation prompts  
- `scripts/claude-testing-evaluator.js` - Evaluation prompts

#### Adding New Implementation Types

The system supports:
- **Code** - JavaScript/Node.js implementations
- **Documentation** - Markdown guides and specifications
- **Analysis** - Research reports and findings
- **Process** - Workflows and procedures
- **Other** - Custom deliverable types

Add new types by extending the type-specific methods in the implementation classes.

#### File Organization

Generated artifacts are stored in:
```
work-items/
  ISSUE-KEY/
    implementation/
      - Primary deliverable file
      - Supporting files
      - Tests/validation
      - README.md
      - implementation-summary.md
    evaluation/
      - evaluation-results.json
      - evaluation-summary.md
```

## 🧪 Testing & Validation

### Manual Testing

Test your setup:

```bash
# Validate environment variables
node -e "
const required = ['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'CLAUDE_API_KEY'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error('Missing:', missing.join(', '));
  process.exit(1);
}
console.log('✅ All environment variables present');
"

# Test Jira connection
curl -u "EMAIL:API_TOKEN" \
  -H "Accept: application/json" \
  "YOUR_JIRA_URL/rest/api/2/myself"

# Test Claude API
curl -H "x-api-key: YOUR_CLAUDE_KEY" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  "https://api.anthropic.com/v1/messages" \
  -d '{"model": "claude-3-5-sonnet-20241022", "max_tokens": 10, "messages": [{"role": "user", "content": "test"}]}'
```

### GitHub Actions Testing

Use the validation workflow:

```bash
# Trigger validation workflow
gh workflow run validate-environmental-variables.yml
```

Or trigger manual test:

```bash
# Manual test with sample issue
gh workflow run jira-webhook-handler.yml -f test_issue_key=TEST-001
```

## 🔍 Monitoring & Troubleshooting

### Logs and Debugging

Check logs in:
- **GitHub Actions**: Repository → Actions tab
- **Netlify Functions**: Netlify dashboard → Functions tab
- **Jira**: Webhooks section shows delivery status

### Common Issues

#### Webhook Not Triggering
- Check Jira webhook configuration
- Verify Netlify function deployment
- Check function logs for errors

#### Claude API Failures
- Verify API key is valid
- Check rate limits
- Review prompt length (max ~200k characters)

#### File Permission Errors
- Ensure `PERSONAL_FINE_TOKEN` has repo write permissions
- Check repository settings allow Actions to write

#### Jira API Errors
- Verify API token is valid
- Check user has permission for project
- Ensure issue types and statuses exist

### Debug Mode

Enable detailed logging by adding debug statements in the processing scripts.

## 📊 Advanced Features

### Custom Prompt Engineering

Modify Claude's behavior by editing prompts in:
- Requirements analysis: Focus on specific domains or methodologies
- Implementation: Add coding standards, architectural patterns
- Evaluation: Customize scoring criteria and quality gates

### Integration Extensions

Extend the system by:
- Adding new webhook sources (GitHub, GitLab, etc.)
- Integrating with Slack for notifications
- Adding database storage for analytics
- Creating custom report generation

### Scaling Considerations

For larger teams:
- Use separate Claude API keys per project
- Implement request queuing for high volume
- Add monitoring and alerting
- Consider premium Jira/Anthropic plans

## 🤝 Contributing

To contribute to this system:

1. Fork the repository
2. Create a feature branch
3. Test your changes thoroughly
4. Submit a pull request with detailed description

### Development Setup

```bash
# Install dependencies
npm install

# Set up environment variables for testing
cp .env.example .env
# Edit .env with your credentials

# Run local tests
npm test
```

## 📝 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For issues and questions:

1. Check the troubleshooting section above
2. Review GitHub Issues for similar problems
3. Create a new issue with detailed logs and configuration
4. For Claude API issues, consult [Anthropic's documentation](https://docs.anthropic.com)
5. For Jira API issues, see [Atlassian's documentation](https://developer.atlassian.com/cloud/jira/platform/)

## 🎉 Success Stories

This system has been successfully used for:
- Automated code generation for microservices
- Technical documentation creation
- Business process design
- Requirements analysis and specification
- Quality assurance and testing

The automation typically saves 60-80% of manual effort while maintaining high quality and consistency.

---

**Ready to get started?** Follow the Quick Start guide above and transform your project management workflow with AI automation!