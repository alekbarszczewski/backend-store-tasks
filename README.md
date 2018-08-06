# backend-store-tasks

Background tasks plugin for [backend-store](https://github.com/alekbarszczewski/backend-store).
It uses [bull](https://github.com/OptimalBits/bull) under the hood.

## Install

```sh
$ yarn add backend-store-tasks
```

## Usage

```js
// store.js

import { Store } from 'backend-store'
import backendStoreTasks from 'backend-store-tasks'

const store = new Store()

store.plugin(backendStoreTasks, {
  redisUrl: process.env.REDIS_URL
})

store.define('myApi', async (payload, methodContext) => {
  const { createTask, context } = methodContext
  // you can create task from inside of any store method, context will be passed to task automatically
  await createTask('myTask', { some: 'payload' })
})

// define background task as normal store method
store.define('myTask', async (payload, methodContext) => {
  const { context } = methodContext
  // context is same as "received" by myApi method (it is passed to background task automatically)
  // payload is { some: 'payload' }
})
```

```js
// worker.js

import store from './store'

store.processTasks('*')
// OR store.processTasks('myTask')
// OR store.processTasks('*', { concurrency: 10 })
```

```js
// cron.js

import store from './store'

setInterval(async () => {
  // you can create tasks by using store.createTask directly
  await store.createTask('myTask', { another: 'payload' }, { custom: 'context' })
}, 10 * 1000)
```

## API

### Store.plugin(backendStoreTasks, options)

| argument                    | Description
|-----------------------------|----------------
| options.redisUrl (required) | Redis URL (for example redis://redis:pass@localhost)
| options.queueOptions        | options passed to bull Queue (see options [here](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue))
| options.defaultJobOptions   | default options used when creating bull job (see below)

**options.defaultJobOptions**

Default job options are as follows:

```
{
  attempts: 3,
  timeout: 60 * 1000, // 1 minute
  removeOnComplete: true,
  removeOnFail: true
}
```

You can override them with `options.defaultJobOptions`.  
All available options are [here](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd).

### Store#createTask (method, payload, context, options) => Promise\<void\>

Create background task. It takes same options as [Store#dispatch](https://alekbarszczewski.github.io/backend-store/#/store?id=dispatchmethod-payload-context-options) method and
additionally it supports options.jobOptions (see below).

| argument           | Description
|--------------------|----------------
| method (required)  | method name
| payload            | method payload
| context            | context
| options.cid        | same as cid option passed to [Store#dispatch](https://alekbarszczewski.github.io/backend-store/#/store?id=dispatchmethod-payload-context-options)
| options.jobOptions | bull job options (see [all available options](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd))

Returns promise which is resolved as soon as task is saved to Redis.

### Store#processTasks(taskName, options) => void

Starts listening and processing of tasks of given type (type is actually method name).

| argument            | Description
|---------------------|----------------
| taskName (required) | method name or `"*"` to process all tasks
| options.concurrency | defaults to 1


### Store#stopProcessingTasks() => Promise\<void\>

Closes Redis connection used by bull. Useful for graceful shutdown.  
Returns promise that resolves when connection is closed.

### methodContext#createTask (method, payload, options) => Promise\<void\>

Create background task. It takes same options as [methodContext#dispatch](https://alekbarszczewski.github.io/backend-store/#/store?id=method-context) method and
additionally it supports options.jobOptions (see below).

| argument           | Description
|--------------------|----------------
| method (required)  | method name
| payload            | method payload
| options.jobOptions | bull job options (see [all available options](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd))

Returns promise which is resolved as soon as task is saved to Redis.
