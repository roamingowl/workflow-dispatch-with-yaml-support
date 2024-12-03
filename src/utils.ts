import * as core from '@actions/core'
import * as github from '@actions/github'
import YAML from 'yaml'

enum TimeUnit {
  S = 1000,
  M = 60 * 1000,
  H = 60 * 60 * 1000
}

function toMilliseconds(timeWithUnit: string): number {
  const unitStr = timeWithUnit.substring(timeWithUnit.length-1)
  const unit = TimeUnit[unitStr.toUpperCase() as keyof typeof TimeUnit]
  if (!unit) {
    throw new Error('Unknown time unit '+unitStr)
  }
  const time = parseFloat(timeWithUnit)
  return time * unit
}

function parse(inputsJsonOrYaml: string) {
  if(inputsJsonOrYaml) {
    //let's try to parse JSON first
    try {
      const parsedJson = JSON.parse(inputsJsonOrYaml)
      //okay it was a valid JSON
      core.debug('Inputs parsed as JSON')
      return parsedJson
    } catch(e) {
      core.debug(`Failed to parse inputs as JSON: ${(e as Error).message}`)
    }
    //ok, it wasn't a valid JSON, let's try again with YAML
    const parsedYaml = YAML.parse(inputsJsonOrYaml)
    if (typeof parsedYaml !== 'object') {
      //inputs must be an object, otherwise it doesn't make sense
      const error = new TypeError('Failed to parse \'inputs\' parameter. Must be a valid JSON or YAML.');
      core.setFailed(error)
      throw error
    }
    core.debug('Inputs parsed as YAML')
    //ok inputs were parsed as YAML
    if (!parsedYaml.meta) {
      //if there was no `meta` input, initialize it
      parsedYaml.meta = {}
    }
    //add info about self, for dispatched workflow
    parsedYaml.meta.workflow_name = github.context.workflow
    parsedYaml.meta.workflow_url = `${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}/attempts/${parseInt(process.env.GITHUB_RUN_ATTEMPT as string)}`
    parsedYaml.meta.workflow_repo = `${github.context.repo.owner}/${github.context.repo.repo}`

    //stringify inputs back, because those are sent
    //to the dispatched workflow through REST call
    parsedYaml.meta = JSON.stringify(parsedYaml.meta)
    return parsedYaml
  }
  return {}
}
export function getArgs() {
  // Required inputs
  const token = core.getInput('token')
  const workflowRef = core.getInput('workflow')
  // Optional inputs, with defaults
  const ref = core.getInput('ref')   || github.context.ref
  const [owner, repo] = core.getInput('repo')
    ? core.getInput('repo').split('/')
    : [github.context.repo.owner, github.context.repo.repo]

  // Decode inputs, this MUST be a valid JSON string
  const inputs = parse(core.getInput('inputs'))

  const displayWorkflowUrlStr = core.getInput('display-workflow-run-url')
  const displayWorkflowUrl = displayWorkflowUrlStr && displayWorkflowUrlStr === 'true'
  const displayWorkflowUrlTimeout = toMilliseconds(core.getInput('display-workflow-run-url-timeout'))
  const displayWorkflowUrlInterval = toMilliseconds(core.getInput('display-workflow-run-url-interval'))

  const waitForCompletionStr = core.getInput('wait-for-completion')
  const waitForCompletion = waitForCompletionStr && waitForCompletionStr === 'true'
  const waitForCompletionTimeout = toMilliseconds(core.getInput('wait-for-completion-timeout'))
  const checkStatusInterval = toMilliseconds(core.getInput('wait-for-completion-interval'))
  const runName = core.getInput('run-name')
  const workflowLogMode = core.getInput('workflow-logs')

  return {
    token,
    workflowRef,
    ref,
    owner,
    repo,
    inputs,
    displayWorkflowUrl,
    displayWorkflowUrlTimeout,
    displayWorkflowUrlInterval,
    checkStatusInterval,
    waitForCompletion,
    waitForCompletionTimeout,
    runName,
    workflowLogMode
  }
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function isTimedOut(start: number, waitForCompletionTimeout: number) {
  return Date.now() > start + waitForCompletionTimeout
}

export function formatDuration(duration: number) {
  const durationSeconds = duration / 1000
  const hours   = Math.floor(durationSeconds / 3600)
  const minutes = Math.floor((durationSeconds - (hours * 3600)) / 60)
  const seconds = durationSeconds - (hours * 3600) - (minutes * 60)

  let hoursStr = hours + ''
  let minutesStr = minutes + ''
  let secondsStr = seconds + ''

  if (hours   < 10) {hoursStr   = '0'+hoursStr}
  if (minutes < 10) {minutesStr = '0'+minutesStr}
  if (seconds < 10) {secondsStr = '0'+secondsStr}
  return hoursStr+'h '+minutesStr+'m '+secondsStr+'s'
}
