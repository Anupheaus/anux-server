import { is, PromiseMaybe } from 'anux-common';
import chalk from 'chalk';
import Server, { Middleware } from 'koa';
import { Server as ListeningServer } from 'http';
import { createKoaServer } from 'routing-controllers';
import bodyParser from 'koa-bodyparser';
import { createLogger, Logger } from 'anux-logger';
import koaStatic from 'koa-static';
import cors from '@koa/cors';
import { usePug } from './pug';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getStartTime = (ctx: any): number => ctx[Symbol.for('request-received.startTime')]?.getTime() ?? Date.now();
const getTimeTaken = (timeStarted: number) => {
  const delta = Date.now() - timeStarted;
  if (delta < 1000) return chalk`{green ${delta}ms}`;
  return chalk`{red ${Math.round(delta / 100) / 10}s}`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logError(logger: Logger, error: any): void {
  const message: string = is.plainObject(error) ? error.message : error;
  logger.error(chalk`{red ${message}}`);
}

function logRequests(logger: Logger): Middleware {
  return async (ctx, next) => {
    const startTime = getStartTime(ctx);
    logger.debug(chalk`{gray <--} {bold ${ctx.method}} {gray ${ctx.originalUrl}}`);
    const removeListeners = () => {
      ctx.res
        .removeListener('finish', done)
        .removeListener('close', done)
        .removeListener('error', reportError);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reportError = (error: any) => {
      removeListeners();
      const message: string = is.plainObject(error) ? error.message : error;
      logger.error(chalk`{red X} {bold ${ctx.method}} {gray ${ctx.originalUrl} ${message}}`);
    };
    const done = () => {
      removeListeners();
      logger.debug(chalk`{gray -->} {bold ${ctx.method}} {gray ${ctx.originalUrl}} {white ${ctx.res.statusCode}} ${getTimeTaken(startTime)}`);
    };
    try {
      await next();
      ctx.res
        .once('finish', done)
        .once('close', done)
        .once('error', reportError);
    } catch (error) {
      reportError(error);
    }
  };
}

interface Props {
  port?: number;
  controllers?: Function[];
  logger?: Logger;
  viewsPath?: string;
  staticPath?: string;
  keepAliveTimeout?: number;
  onBeforeStarted?(app: Server): PromiseMaybe<void>;
  onStarted?(app: Server): PromiseMaybe<void>;
  onStopped?(app: Server): PromiseMaybe<void>;
}

export function startServer({
  port = 3000,
  logger = createLogger({ category: 'anux-server' }),
  keepAliveTimeout,
  viewsPath,
  staticPath,
  controllers = [],
  onBeforeStarted = () => void 0,
  onStarted = () => void 0,
  onStopped = () => void 0,
}: Props = {}) {
  logger.info('Starting server...', { port });
  const app: Server = createKoaServer({
    controllers,
  });
  let listeningServer: ListeningServer | undefined = undefined;
  let hasStoppedServer = false;
  let hasServerStarted = false;
  (async () => {
    try {
      app.use(bodyParser());
      app.use(cors());
      app.use(logRequests(logger));
      if (is.not.empty(staticPath)) app.use(koaStatic(staticPath));
      if (is.not.empty(viewsPath)) usePug(app, viewsPath);
      if (hasStoppedServer) return;
      await onBeforeStarted(app);
      if (hasStoppedServer) return;
      await new Promise((resolve, reject) => {
        listeningServer = app
          .listen(port)
          .on('error', error => {
            logError(logger, error);
            reject(error);
          })
          .on('listening', async () => {
            logger.debug('Server accepting requests...');
            await onStarted(app);
            hasServerStarted = true;
            logger.info('Server started.');
            resolve();
          });
        if (keepAliveTimeout != null && keepAliveTimeout >= 1) listeningServer.keepAliveTimeout = keepAliveTimeout;
      });
    } catch (error) {
      logError(logger, error);
    }
  })();
  return async () => {
    logger.info('Stopping server...');
    hasStoppedServer = true;
    await new Promise(resolve => listeningServer ? listeningServer.close(resolve) : resolve());
    if (hasServerStarted) await onStopped(app);
    logger.info('Server stopped.');
  };
}
