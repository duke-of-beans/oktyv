# oktyv

A universal automation execution layer for AI agents — 10 engines, 73 tools, one consistent interface for browser control, API calls, shell execution, email, databases, scheduled jobs, credential storage, and visual QA.

## The problem

An AI agent that can reason well but can't reliably *act* — click a button, call an API, read a database, wait for a cron trigger — is only half useful. Most agent tooling solves one of these at a time, each with its own quirks, auth model, and failure mode.

## What it does

oktyv gives one consistent execution surface across ten different action types: browser automation, generic API requests, shell commands, email send/receive, database queries, scheduled/cron tasks, encrypted credential storage, visual QA screenshotting, and parallel task execution — all callable the same way, all with the same error-handling and logging discipline underneath.

## Part of a system

oktyv is the execution layer in a larger cognitive-infrastructure stack — memory, maintenance, and session continuity live in separate, composable pieces. See [davidkirsch.me/builds](https://davidkirsch.me/builds) for the rest.
