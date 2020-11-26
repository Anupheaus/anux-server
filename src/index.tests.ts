import { startServer } from './server';
import { Controller } from './routing';
import { Get, Render } from 'routing-controllers';
import path from 'path';
import axios from 'axios';
import { createLogger } from './logger';

const port = 3048;

@Controller('/test')
class TestController {

  @Get('/')
  public async get() {
    return {
      something: 'else',
    };
  }

  @Get('/page')
  @Render('test.pug')
  public getPage() {
    return { title: 'hey!' };
  }

}

const logger = createLogger({ service: 'Testing service', level: 'error' });

describe('server', () => {

  it('can serves an api endpoint', async () => {
    let stopServer = () => Promise.resolve();
    await new Promise(resolve => {
      stopServer = startServer({
        port,
        logger,
        keepAliveTimeout: 1,
        controllers: [TestController],
        onStarted: resolve,
      });
    });
    const response = await axios.get(`http://localhost:${port}/test`);
    expect(response.data).to.eql({ something: 'else' });
    await stopServer();
  });

  it('can serve a pug template', async () => {
    let stopServer = () => Promise.resolve();
    await new Promise(resolve => {
      stopServer = startServer({
        port,
        logger,
        keepAliveTimeout: 1,
        viewsPath: path.resolve(__dirname, '../tests/views'),
        controllers: [TestController],
        onStarted: resolve,
      });
    });
    const response = await axios.get(`http://localhost:${port}/test/page`);
    expect(response.data).to.eq('<head><title>hey!</title></head><body><div>body of the document here</div></body>');
    await stopServer();
  });

  it('can serve a static file', async () => {
    let stopServer = () => Promise.resolve();
    await new Promise(resolve => {
      stopServer = startServer({
        port,
        logger,
        keepAliveTimeout: 1,
        staticPath: path.resolve(__dirname, '../tests/static'),
        onStarted: resolve,
      });
    });
    const response = await axios.get(`http://localhost:${port}/sample.js`);
    expect(response.data).to.eq('let a = 1;\r\na += 2;\r\nmodule.exports = a;');
    await stopServer();
  });

});