import { startServer } from './server';
import { Controller } from './routing';
import { Get, Render } from 'routing-controllers';
import path from 'path';
import axios from 'axios';
import { createLogger } from 'anux-logger';

const port = 3067;
const host = 'agency.upmyavenue.com';

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

const keyFile = './server.key';
const certFile = './server.crt';
const caFile = './ca.crt';
const logger = createLogger({ category: 'Testing service', level: 'error' });

describe('server', () => {

  it('can serves an api endpoint', async () => {
    let stopServer = () => Promise.resolve();
    await new Promise(resolve => {
      stopServer = startServer({
        host,
        port,
        logger,
        keyFile,
        certFile,
        caFile,
        controllers: [TestController],
        onStarted: resolve,
      });
    });
    const adapter = require('axios/lib/adapters/http');
    const response = await axios.get(`https://${host}:${port}/test`, { adapter });
    expect(response.data).to.eql({ something: 'else' });
    await stopServer();
  });

  it('can serve a pug template', async () => {
    let stopServer = () => Promise.resolve();
    await new Promise(resolve => {
      stopServer = startServer({
        port,
        logger,
        keyFile,
        certFile,
        caFile,
        viewsPath: path.resolve(__dirname, '../tests/views'),
        controllers: [TestController],
        onStarted: resolve,
      });
    });
    const adapter = require('axios/lib/adapters/http');
    const response = await axios.get(`https://${host}:${port}/test/page`, { adapter });
    expect(response.data).to.eq('<head><title>hey!</title></head><body><div>body of the document here</div></body>');
    await stopServer();
  });

  it('can serve a static file', async () => {
    let stopServer = () => Promise.resolve();
    await new Promise(resolve => {
      stopServer = startServer({
        port,
        logger,
        keyFile,
        certFile,
        caFile,
        staticPath: path.resolve(__dirname, '../tests/static'),
        onStarted: resolve,
      });
    });
    const adapter = require('axios/lib/adapters/http');
    const response = await axios.get(`https://${host}:${port}/sample.js`, { adapter });
    expect(response.data).to.eq('let a = 1;\r\na += 2;\r\nmodule.exports = a;');
    await stopServer();
  });

});