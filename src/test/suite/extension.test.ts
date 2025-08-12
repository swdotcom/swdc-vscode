import * as assert from 'assert';
import * as sinon from 'sinon';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { before, after } from 'mocha';
import { appGet } from '../../http/HttpClient';
import { getItem, setItem } from '../../Util';
// import * as myExtension from '../../extension';

require('dotenv').config({ path: '.env.local' });

suite('extension test suite', () => {

  suite('blank jwt test suite', () => {
    test('renders an invalid session modal only once', async () => {
      const showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
      for (let i = 0; i < 3; i++) {
        await appGet('/api/v1/user/session_summary');
      }
      sinon.assert.calledOnceWithMatch(
        showInformationMessageStub,
        "We couldn't verify your session. Please log in again to continue using Code Time features"
      );
      showInformationMessageStub.restore();
    });
  });

  suite('invalid jwt test suite', () => {
    test('nullifies invalid jwt token', async () => {
      setItem('jwt', 'mocked-jwt');
      await appGet('/api/v1/user/session_summary');
      assert.strictEqual(getItem('jwt'), '');
    });
  });

  suite('valid jwt test suite', () => {
    before(() => {
      // sets the environment variables for testing
      setItem('jwt', process.env.JWT);
      setItem('name', process.env.NAME);
    });

    after(() => {
      // resets the environment variables after testing
      setItem('jwt', null);
      setItem('name', null);
    })

    test('renders a successful response', async () => {
      const response = await appGet('/api/v1/user/session_summary');
      assert.strictEqual(response.status, 200);
    });
  });
});
