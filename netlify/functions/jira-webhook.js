// netlify/functions/jira-webhook.js
exports.handler = async (event, context) => {
  console.log('Jira webhook received at:', new Date().toISOString());

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const jiraPayload = JSON.parse(event.body);
    
    console.log('Webhook event:', jiraPayload.webhookEvent);
    console.log('Issue key:', jiraPayload.issue?.key);
    
    // ONLY dispatch once per webhook
    const githubResponse = await fetch(`https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Jira-Claude-Automation'
      },
      body: JSON.stringify({
        event_type: 'jira-webhook',
        client_payload: jiraPayload
      })
    });

    if (!githubResponse.ok) {
      const errorText = await githubResponse.text();
      console.error('GitHub dispatch failed:', errorText);
      throw new Error(`GitHub dispatch failed: ${githubResponse.status} - ${errorText}`);
    }

    console.log('✅ Successfully dispatched to GitHub Actions');
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Webhook processed successfully',
        dispatched: true,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Webhook processing error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
