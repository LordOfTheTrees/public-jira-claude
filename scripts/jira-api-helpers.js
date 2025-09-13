// jira-api-helpers.js
// Helper functions for Jira API interactions

class JiraApiHelpers {
  constructor() {
    this.baseUrl = process.env.JIRA_URL;
    this.email = process.env.JIRA_EMAIL;
    this.token = process.env.JIRA_API_TOKEN;
    this.authHeader = `Basic ${Buffer.from(`${this.email}:${this.token}`).toString('base64')}`;
  }

  async getIssue(issueKey) {
    try {
      const response = await fetch(`${this.baseUrl}/rest/api/2/issue/${issueKey}`, {
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch issue ${issueKey}: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error fetching issue ${issueKey}:`, error);
      throw error;
    }
  }

  async createIssue(projectKey, issueType, summary, description, additionalFields = {}) {
    try {
      const payload = {
        fields: {
          project: { key: projectKey },
          issuetype: { name: issueType },
          summary: summary,
          description: description,
          ...additionalFields
        }
      };

      const response = await fetch(`${this.baseUrl}/rest/api/2/issue`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create issue: ${response.status} - ${errorText}`);
      }

      const newIssue = await response.json();
      console.log(`✅ Created issue: ${newIssue.key}`);
      return newIssue;
    } catch (error) {
      console.error('Error creating issue:', error);
      throw error;
    }
  }

  async updateIssue(issueKey, fields) {
    try {
      const payload = { fields };

      const response = await fetch(`${this.baseUrl}/rest/api/2/issue/${issueKey}`, {
        method: 'PUT',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update issue ${issueKey}: ${response.status} - ${errorText}`);
      }

      console.log(`✅ Updated issue: ${issueKey}`);
      return true;
    } catch (error) {
      console.error(`Error updating issue ${issueKey}:`, error);
      throw error;
    }
  }

  async addComment(issueKey, comment) {
    try {
      const payload = { body: comment };

      const response = await fetch(`${this.baseUrl}/rest/api/2/issue/${issueKey}/comment`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to add comment to ${issueKey}: ${response.status} - ${errorText}`);
      }

      console.log(`✅ Added comment to ${issueKey}`);
      return await response.json();
    } catch (error) {
      console.error(`Error adding comment to ${issueKey}:`, error);
      throw error;
    }
  }

  async transitionIssue(issueKey, transitionId) {
    try {
      const payload = {
        transition: { id: transitionId }
      };

      const response = await fetch(`${this.baseUrl}/rest/api/2/issue/${issueKey}/transitions`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to transition issue ${issueKey}: ${response.status} - ${errorText}`);
      }

      console.log(`✅ Transitioned issue: ${issueKey}`);
      return true;
    } catch (error) {
      console.error(`Error transitioning issue ${issueKey}:`, error);
      throw error;
    }
  }

  async getAvailableTransitions(issueKey) {
    try {
      const response = await fetch(`${this.baseUrl}/rest/api/2/issue/${issueKey}/transitions`, {
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get transitions for ${issueKey}: ${response.status}`);
      }

      const data = await response.json();
      return data.transitions;
    } catch (error) {
      console.error(`Error getting transitions for ${issueKey}:`, error);
      throw error;
    }
  }

  async searchIssues(jql, fields = ['summary', 'status', 'issuetype']) {
    try {
      const params = new URLSearchParams({
        jql: jql,
        fields: fields.join(','),
        maxResults: '100'
      });

      const response = await fetch(`${this.baseUrl}/rest/api/2/search?${params}`, {
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to search issues: ${response.status}`);
      }

      const data = await response.json();
      return data.issues;
    } catch (error) {
      console.error('Error searching issues:', error);
      throw error;
    }
  }

  async linkIssues(inwardIssueKey, outwardIssueKey, linkType = 'Relates') {
    try {
      const payload = {
        type: { name: linkType },
        inwardIssue: { key: inwardIssueKey },
        outwardIssue: { key: outwardIssueKey }
      };

      const response = await fetch(`${this.baseUrl}/rest/api/2/issueLink`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to link issues: ${response.status} - ${errorText}`);
      }

      console.log(`✅ Linked issues: ${inwardIssueKey} -> ${outwardIssueKey}`);
      return true;
    } catch (error) {
      console.error('Error linking issues:', error);
      throw error;
    }
  }

  async addAttachment(issueKey, filename, content) {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([content], { type: 'text/plain' }), filename);

      const response = await fetch(`${this.baseUrl}/rest/api/2/issue/${issueKey}/attachments`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'X-Atlassian-Token': 'no-check'
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to add attachment: ${response.status} - ${errorText}`);
      }

      console.log(`✅ Added attachment to ${issueKey}: ${filename}`);
      return await response.json();
    } catch (error) {
      console.error(`Error adding attachment to ${issueKey}:`, error);
      throw error;
    }
  }

  async getProject(projectKey) {
    try {
      const response = await fetch(`${this.baseUrl}/rest/api/2/project/${projectKey}`, {
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch project ${projectKey}: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error fetching project ${projectKey}:`, error);
      throw error;
    }
  }

  async getCurrentUser() {
    try {
      const response = await fetch(`${this.baseUrl}/rest/api/2/myself`, {
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch current user: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching current user:', error);
      throw error;
    }
  }

  formatComment(title, content, footer = null) {
    let comment = `**${title}**\n\n${content}`;
    if (footer) {
      comment += `\n\n${footer}`;
    }
    return comment;
  }

  extractIssueKeyFromSummary(summary) {
    const match = summary.match(/([A-Z]+-\d+)/);
    return match ? match[1] : null;
  }

  isAutomationIssue(issue) {
    const summary = issue.fields.summary;
    const automationMarkers = [
      '🎯 Deliverable Criteria:',
      '🤖 Automated',
      'Claude Generated',
      '✅ Implementation:'
    ];
    return automationMarkers.some(marker => summary.includes(marker));
  }

  getIssueUrl(issueKey) {
    return `${this.baseUrl}/browse/${issueKey}`;
  }

  async validateConnection() {
    try {
      await this.getCurrentUser();
      console.log('✅ Jira API connection validated');
      return true;
    } catch (error) {
      console.error('❌ Jira API connection failed:', error);
      throw new Error('Failed to validate Jira API connection');
    }
  }
}

module.exports = JiraApiHelpers;
