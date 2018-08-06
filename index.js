const Queue = require('bull')

function backendStoreTasksPlugin (store, options) {
  const queue = new Queue(options.redisUrl, options.queueOptions)

  const defaultJobOptions = {
    attempts: 3,
    timeout: 60 * 1000, // 1 minute
    removeOnComplete: true,
    removeOnFail: true,
    ...options.defaultJobOptions
  }

  const transformContext = options.transformContext || ((context) => context)

  const createTask = function createTask ({
    method,
    payload,
    context,
    cid,
    jobOptions
  }) {
    return queue.add(method, {
      method,
      payload,
      context: transformContext(context),
      cid
    }, {
      ...defaultJobOptions,
      ...jobOptions
    })
      .catch(err => {
        if (err.message.match(/circular structure to JSON/i)) {
          throw new Error(`
            Error during serialization of payload or context: ${err.message}.
            For context serialization please refer to options.transformContext option of backend-store-tasks plugin
          `)
        } else {
          throw err
        }
      })
  }

  store.use(async function backendStoreTasksMiddleware (payload, middlewareContext, next) {
    middlewareContext.methodContext.createTask = (method, payload, options = {}) => {
      return createTask({
        method,
        payload,
        context: middlewareContext.context,
        cid: middlewareContext.cid,
        jobOptions: options.jobOptions
      })
    }
    return next(payload)
  })

  store.createTask = (method, payload, context, options = {}) => {
    return createTask({
      method,
      payload,
      context,
      cid: options.cid,
      jobOptions: options.jobOptions
    })
  }

  store.processTasks = function processTasks (method, options = {}) {
    const concurrency = options.concurrency || 1

    queue.process(method, concurrency, async function jobProcessor (job) {
      const {
        method,
        payload,
        context
        // cid
      } = job.data
      await store.dispatch(method, payload, context)
    })
  }

  store.stopProcessingTasks = function stopProcessingTasks () {
    return queue.close()
  }

  store.taskQueue = queue
}

module.exports = backendStoreTasksPlugin
module.exports.default = backendStoreTasksPlugin

Object.defineProperty(exports, '__esModule', {
  value: true
})
