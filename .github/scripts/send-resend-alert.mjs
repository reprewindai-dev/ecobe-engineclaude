const apiKey = process.env.RESEND_API_KEY?.trim()
const from = process.env.RESEND_FROM_ALERTS?.trim()
const to = process.env.ALERT_INBOX_EMAIL?.trim()

if (!apiKey || !from || !to) {
  console.log('Skipping alert send because alert mail environment variables are not configured.')
  process.exit(0)
}

const subject = process.env.ALERT_SUBJECT?.trim() || 'CO2 Router workflow alert'
const summary = process.env.ALERT_SUMMARY?.trim() || 'Workflow failure detected.'
const workflow = process.env.GITHUB_WORKFLOW || 'unknown'
const runId = process.env.GITHUB_RUN_ID || 'unknown'
const repository = process.env.GITHUB_REPOSITORY || 'unknown'
const refName = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || 'unknown'
const sha = process.env.GITHUB_SHA || 'unknown'
const job = process.env.GITHUB_JOB || 'unknown'
const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
const runUrl = `${serverUrl}/${repository}/actions/runs/${runId}`

const text = [
  'CO2 Router operational alert',
  '',
  `Summary: ${summary}`,
  `Workflow: ${workflow}`,
  `Job: ${job}`,
  `Repository: ${repository}`,
  `Ref: ${refName}`,
  `Commit: ${sha}`,
  `Run URL: ${runUrl}`,
].join('\n')

const html = `
  <div style="font-family:Arial,sans-serif;background:#020617;color:#e2e8f0;padding:24px">
    <h1 style="font-size:18px;margin:0 0 16px;color:#f8fafc">CO2 Router operational alert</h1>
    <p><strong>Summary:</strong> ${summary}</p>
    <p><strong>Workflow:</strong> ${workflow}</p>
    <p><strong>Job:</strong> ${job}</p>
    <p><strong>Repository:</strong> ${repository}</p>
    <p><strong>Ref:</strong> ${refName}</p>
    <p><strong>Commit:</strong> ${sha}</p>
    <p><strong>Run URL:</strong> <a href="${runUrl}" style="color:#22d3ee">${runUrl}</a></p>
  </div>
`

const response = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from,
    to,
    subject,
    text,
    html,
  }),
})

if (!response.ok) {
  const payload = await response.text()
  console.error(`Resend alert send failed: ${response.status} ${payload}`)
  process.exit(1)
}

console.log(`Alert sent: ${subject}`)
