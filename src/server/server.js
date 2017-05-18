import 'universal-fetch';

import express from 'express';
import { END } from 'redux-saga';

import enrichClientBundleWithHotReloading from './enrichClientBundleWithHotReloading';
import enrichProductionStaticFileServing from './enrichProductionStaticFileServing';
import exitWhenError from './exitWhenError';
import htmlTemplate from '../htmlTemplate';
import createStore from '../redux/createStore';
import renderAppToString from '../redux/renderAppToString';
import createRouter from '../router/createRouter';
import { isNotFoundRoute } from '../selectors';

exitWhenError();

const NOT_FOUND_CODE = 404;
const OK_CODE = 200;
const ERROR_CODE = 500;

const getJsAndCssBundle = () => {
  if (process.env.NODE_ENV === 'development') {
    return { js: 'bundle.js' };
  }

  const manifest = require('./client/asset-manifest.json');
  return { js: manifest['main.js'], css: manifest['main.css'] };
};

const server = express();

if (process.env.NODE_ENV === 'development') {
  enrichClientBundleWithHotReloading(server);
} else {
  enrichProductionStaticFileServing(server);
}

const { js, css } = getJsAndCssBundle();
const templateProvider = htmlTemplate(js, css);
server.get('*', (req, res) => {
  let reducer;
  let routes;
  let saga;

  if (__HAS_REDUX__) {
    reducer = require('app/reducers/rootReducer').default;
  }

  if (__HAS_ROUTING__) {
    routes = require('app/routing/routes').default;
  }

  if (__HAS_SAGA__) {
    saga = require('app/sagas/rootSaga').default;
  }

  const router = createRouter(routes);
  const { store, task } = createStore(reducer, saga, router);

  router.start(req.originalUrl, (error) => {
    store.dispatch(END);
    task.done.then(() => {
      if (error) {
        res
          .status(ERROR_CODE)
          .send(error);
      } else {
        const state = store.getState();
        const found = routes ? !isNotFoundRoute(state) : true;

        res
          .status(found ? OK_CODE : NOT_FOUND_CODE)
          .send(templateProvider(renderAppToString(store), store.getState()));
      }
    });
  });
});

server.listen(process.env.PORT || 3000);

if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept('app/components/Root');

  if (__HAS_REDUX__) {
    module.hot.accept('app/reducers/rootReducer');
  }

  if (__HAS_SAGA__) {
    module.hot.accept('app/sagas/rootSaga');
  }
}
