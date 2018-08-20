/* eslint-env mocha */

const { Store } = require('backend-store')
const { expect } = require('chai')
const sinon = require('sinon')
const backendStoreTasks = require('./index')

let store
let workerStore

const usePlugin = (store, options = {}) => {
  store.plugin(backendStoreTasks, {
    redisUrl: process.env.REDIS_URL,
    ...options
  })
}

const getAllJobs = async () => {
  const jobs = await store.taskQueue.getJobs()
    .map(job => ({
      id: job.id,
      data: job.data,
      opts: job.opts
    }))
  return jobs
}

const defaultJobOptions = {
  attempts: 3,
  timeout: 60 * 1000,
  removeOnComplete: true,
  removeOnFail: true
}

beforeEach(() => {
  store = new Store()
  store.define('task1', async (payload, methodContext) => {

  })
  store.define('task2', async (payload, methodContext) => {

  })
  workerStore = new Store()
})

afterEach(async () => {
  for (let st of [ store, workerStore ]) {
    if (st.taskQueue) {
      if (st.taskQueue.clients[0].status !== 'end') {
        await st.taskQueue.clients[0].flushdb()
        await st.stopProcessingTasks()
      }
    }
  }
  store = null
  workerStore = null
})

describe('store#createTask', () => {
  it('create task with default options', async () => {
    usePlugin(store)
    const payload = { a: 123 }
    const context = { b: 456 }
    const options = { cid: 'abc' }
    await store.createTask('task1', payload, context, options)
    const jobs = await getAllJobs()
    expect(jobs.length).to.equal(1)
    expect(jobs[0].data).to.eql({
      method: 'task1',
      payload,
      context,
      cid: 'abc'
    })
    expect(jobs[0].opts).to.include(defaultJobOptions)
  })

  it('create task with custom options', async () => {
    usePlugin(store, { queueName: 'abc' })
    const payload = { a: 123 }
    const context = { b: 456 }
    const options = {
      cid: 'abc',
      jobOptions: {
        attempts: 1,
        timeout: 1,
        removeOnComplete: false,
        removeOnFail: false
      }
    }
    await store.createTask('task1', payload, context, options)
    const jobs = await getAllJobs()
    expect(jobs.length).to.equal(1)
    expect(jobs[0].data).to.eql({
      method: 'task1',
      payload,
      context,
      cid: 'abc'
    })
    expect(jobs[0].opts).to.include({
      attempts: 1,
      timeout: 1,
      removeOnComplete: false,
      removeOnFail: false
    })
  })

  it('create task without payload, context, cid', async () => {
    usePlugin(store)
    await store.createTask('task1')
    const jobs = await getAllJobs()
    expect(jobs.length).to.equal(1)
    expect(jobs[0].data).to.eql({
      method: 'task1'
    })
  })

  it('support transformContext option', async () => {
    usePlugin(store, {
      transformContext (context) {
        return { user: context.user }
      }
    })
    const payload = { a: 123 }
    const context = { key: 'value', user: { id: 1 } }
    const options = { cid: 'abc' }
    await store.createTask('task1', payload, context, options)
    const jobs = await getAllJobs()
    expect(jobs.length).to.equal(1)
    expect(jobs[0].data).to.eql({
      method: 'task1',
      payload,
      context: { user: context.user },
      cid: 'abc'
    })
    expect(jobs[0].opts).to.include(defaultJobOptions)
  })

  it('return correct error on circular payload, context', async () => {
    usePlugin(store)
    const payload = {}
    payload.payload = payload
    const context = {}
    context.context = context
    let err1
    let err2
    try {
      await store.createTask('task1', payload)
    } catch (err) {
      err1 = err
    }

    expect(err1).to.match(/Error during serialization of payload or context/i)

    try {
      await store.createTask('task1', null, context)
    } catch (err) {
      err2 = err
    }

    expect(err2).to.match(/Error during serialization of payload or context/i)
  })

  // it('throw error', async () => {
  //   store.plugin(backendStoreTasks, {
  //     redisUrl: 'redis://invalid:1234',
  //     queueOptions: {
  //
  //     }
  //   })
  //   let err1
  //   try {
  //     await store.createTask('task1')
  //   } catch (err) {
  //     err1 = err
  //   }
  //   console.log(err1)
  // })
})

describe('methodContext#createTask', () => {
  it('create task with default options', async () => {
    usePlugin(store)

    const payload = { a: 123 }
    const context = { b: 456 }
    const options = { cid: 'abc' }

    let cid

    store.define('api', async (parentPayload, methodContext) => {
      cid = methodContext.cid
      await methodContext.createTask('task1', payload, options)
    })
    await store.dispatch('api', null, context)

    const jobs = await getAllJobs()
    expect(jobs.length).to.equal(1)
    expect(jobs[0].data).to.eql({
      method: 'task1',
      payload,
      context,
      cid
    })
    expect(jobs[0].opts).to.include(defaultJobOptions)
  })

  it('create task with custom options', async () => {
    usePlugin(store)

    const payload = { a: 123 }
    const context = { b: 456 }
    const options = {
      jobOptions: {
        attempts: 1,
        timeout: 1,
        removeOnComplete: false,
        removeOnFail: false
      }
    }

    let cid

    store.define('api', async (parentPayload, methodContext) => {
      cid = methodContext.cid
      await methodContext.createTask('task1', payload, options)
    })
    await store.dispatch('api', null, context)

    const jobs = await getAllJobs()
    expect(jobs.length).to.equal(1)
    expect(jobs[0].data).to.eql({
      method: 'task1',
      payload,
      context,
      cid
    })
    expect(jobs[0].opts).to.include({
      attempts: 1,
      timeout: 1,
      removeOnComplete: false,
      removeOnFail: false
    })
  })

  it('create task without payload', async () => {
    usePlugin(store)

    const context = { b: 456 }
    let cid

    store.define('api', async (parentPayload, methodContext) => {
      cid = methodContext.cid
      await methodContext.createTask('task1')
    })
    await store.dispatch('api', null, context)

    const jobs = await getAllJobs()
    expect(jobs.length).to.equal(1)
    expect(jobs[0].data).to.eql({
      method: 'task1',
      context,
      cid
    })
    expect(jobs[0].opts).to.include(defaultJobOptions)
  })

  it('support transformContext option', async () => {
    usePlugin(store, {
      transformContext (context) {
        return { user: context.user }
      }
    })

    const context = { key: 'value', user: { id: 1 } }
    let cid

    store.define('api', async (parentPayload, methodContext) => {
      cid = methodContext.cid
      await methodContext.createTask('task1')
    })
    await store.dispatch('api', null, context)

    const jobs = await getAllJobs()
    expect(jobs.length).to.equal(1)
    expect(jobs[0].data).to.eql({
      method: 'task1',
      context: { user: context.user },
      cid
    })
    expect(jobs[0].opts).to.include(defaultJobOptions)
  })
})

describe('store#processTasks', () => {
  const processTask = (taskType, count = 1) => {
    let completedJobs = 0
    return new Promise((resolve, reject) => {
      workerStore.taskQueue.on('completed', () => {
        ++completedJobs
        if (completedJobs === count) {
          resolve()
        }
      })
      workerStore.processTasks(taskType)
    })
  }

  it('process task', async () => {
    const spy = sinon.spy()
    workerStore.define('testTask', spy)
    usePlugin(store)
    usePlugin(workerStore)

    const payload = { a: 123 }
    const context = { b: 456 }
    await store.createTask('testTask', payload, context)
    await processTask('testTask')

    expect(spy.calledOnce).to.equal(true)
    expect(spy.firstCall.args[0]).to.eql(payload)
    const methodContext = spy.firstCall.args[1]
    expect(methodContext.context).to.eql(context)
  })

  it('respect concurrency option', async () => {
    usePlugin(workerStore)
    const stub = sinon.stub(workerStore.taskQueue, 'process')
    workerStore.processTasks('testTask', { concurrency: 10 })
    expect(stub.calledOnce).to.equal(true)
    expect(stub.firstCall.args[0]).to.equal('testTask')
    expect(stub.firstCall.args[1]).to.equal(10)
  })

  it('process all task types', async () => {
    const spy1 = sinon.spy()
    workerStore.define('testTask1', spy1)
    const spy2 = sinon.spy()
    workerStore.define('testTask2', spy2)
    usePlugin(store)
    usePlugin(workerStore)

    const payload = { a: 123 }
    const context = { b: 456 }
    await store.createTask('testTask1', payload, context)
    await store.createTask('testTask2', payload, context)
    await processTask('*', 2)

    for (let spy of [spy1, spy2]) {
      expect(spy.calledOnce).to.equal(true)
      expect(spy.firstCall.args[0]).to.eql(payload)
      const methodContext = spy.firstCall.args[1]
      expect(methodContext.context).to.eql(context)
    }
  })
})

describe('store#stopProcessingTasks', () => {
  it('close queue', async () => {
    usePlugin(workerStore)
    workerStore.processTasks('testTask', { concurrency: 10 })
    await workerStore.stopProcessingTasks()
    expect(workerStore.taskQueue.clients[0].status).to.equal('end')
  })
})
