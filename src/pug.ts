import Server from 'koa';
import Pug from 'koa-pug';

export function usePug(app: Server, viewPath: string): void {
  new Pug({
    viewPath,
    app,
  });
}