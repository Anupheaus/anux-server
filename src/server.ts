import { is, PromiseMaybe } from 'anux-common';
import chalk from 'chalk';
import Server, { Middleware } from 'koa';
import { createKoaServer } from 'routing-controllers';
import bodyParser from 'koa-bodyparser';
import { createLogger, Logger } from 'anux-logger';
import koaStatic from 'koa-static';
import cors from '@koa/cors';
import { usePug } from './pug';
import { createSecureServer, Http2SecureServer } from 'http2';
import fs from 'fs';
import path from 'path';

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
  host?: string;
  port?: number;
  controllers?: Function[];
  logger?: Logger;
  viewsPath?: string;
  staticPath?: string;
  keyFile: string | Buffer;
  certFile: string | Buffer;
  caFile: string | Buffer;
  onBeforeStarted?(app: Server): PromiseMaybe<void>;
  onStarted?(app: Server): PromiseMaybe<void>;
  onStopped?(app: Server): PromiseMaybe<void>;
}

async function startListening(app: Server, host: string, port: number, keyFile: string | Buffer | undefined, certFile: string | Buffer | undefined,
  caFile: string | Buffer | undefined): Promise<Http2SecureServer> {
  const key = is.string(keyFile) ? fs.readFileSync(path.resolve(process.cwd(), keyFile)) : keyFile;
  const cert = is.string(certFile) ? fs.readFileSync(path.resolve(process.cwd(), certFile)) : certFile;
  const ca = is.string(caFile) ? fs.readFileSync(path.resolve(process.cwd(), caFile)) : caFile;
  return new Promise<Http2SecureServer>(resolve => {
    const listeningServer = createSecureServer({
      key,
      cert,
      ca,
      allowHTTP1: true,
    }, app.callback())
      .listen({ host, port }, () => {
        resolve(listeningServer);
      });
  });
}

export function startServer({
  host = 'localhost',
  port = 3000,
  logger = createLogger({ category: 'anux-server' }),
  viewsPath,
  staticPath,
  controllers = [],
  keyFile,
  certFile,
  caFile,
  onBeforeStarted = () => void 0,
  onStarted = () => void 0,
  onStopped = () => void 0,
}: Props) {
  logger.info('Starting server...', { port });
  const app: Server = createKoaServer({
    controllers,
  });
  let listeningServer: Http2SecureServer | undefined = undefined;
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
      listeningServer = await startListening(app, host, port, keyFile, certFile, caFile);
      hasServerStarted = true;
      logger.debug('Server accepting requests...');
      await onStarted(app);
    } catch (error) {
      logError(logger, error);
    }
  })();
  return async () => {
    logger.info('Stopping server...');
    hasStoppedServer = true;
    await new Promise<void>(resolve => listeningServer ? listeningServer.close(() => resolve()) : resolve());
    if (hasServerStarted) await onStopped(app);
    logger.info('Server stopped.');
  };
}
