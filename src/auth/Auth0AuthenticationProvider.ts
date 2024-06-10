import {
  authentication, AuthenticationProvider, AuthenticationProviderAuthenticationSessionsChangeEvent,
  AuthenticationSession, Disposable, Event, env, EventEmitter, ExtensionContext, ProgressLocation,
  Uri, UriHandler, window
} from "vscode";
import { v4 as uuid } from 'uuid';
import { app_url } from "../Constants";
import { getAuthQueryObject } from "../Util";
import { authenticationCompleteHandler, getUser } from "../DataController";

export const AUTH_TYPE = 'codetime_auth0';
const AUTH_NAME = 'Software.com';
const SESSIONS_KEY = `${AUTH_TYPE}.sessions`

class UriEventHandler extends EventEmitter<Uri> implements UriHandler {
  public handleUri(uri: Uri) {
    this.fire(uri);
  }
}

export class Auth0AuthenticationProvider implements AuthenticationProvider, Disposable {
  private _sessionChangeEmitter = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
  private _disposable: Disposable;
  private _pendingStates: string[] = [];
  private _codeExchangePromises = new Map<string, { promise: Promise<string>; cancel: EventEmitter<void> }>();
  private _uriHandler = new UriEventHandler();

  constructor(private readonly context: ExtensionContext) {
    this._disposable = Disposable.from(
      authentication.registerAuthenticationProvider(AUTH_TYPE, AUTH_NAME, this, { supportsMultipleAccounts: false }),
      window.registerUriHandler(this._uriHandler)
    )
  }

  get onDidChangeSessions() {
    return this._sessionChangeEmitter.event;
  }

  get redirectUri() {
    const publisher = this.context.extension.packageJSON.publisher;
    const name = this.context.extension.packageJSON.name;
    return `${env.uriScheme}://${publisher}.${name}`;
  }

  /**
   * Get the existing sessions
   * @param scopes 
   * @returns 
   */
  public async getSessions(scopes?: string[]): Promise<readonly AuthenticationSession[]> {
    const allSessions = await this.context.secrets.get(SESSIONS_KEY);

    if (allSessions) {
      return JSON.parse(allSessions) as AuthenticationSession[];
    }

    return [];
  }

  /**
   * Create a new auth session
   * @param scopes 
   * @returns 
   */
  public async createSession(scopes: string[]): Promise<AuthenticationSession> {
    try {
      const jwtToken = await this.login(scopes);
      if (!jwtToken) {
        throw new Error(`Software.com login failure`);
      }

      // const userinfo: { name: string, email: string } = await this.getUserInfo(token);
      const user = await getUser(jwtToken);
      await authenticationCompleteHandler(user, jwtToken);

      const session: AuthenticationSession = {
        id: uuid(),
        accessToken: jwtToken,
        account: {
          label: user.email,
          id: user.id
        },
        scopes: []
      };

      await this.context.secrets.store(SESSIONS_KEY, JSON.stringify([session]))

      this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });

      return session;
    } catch (e) {
      throw e;
    }
  }

  /**
   * Remove an existing session
   * @param sessionId 
   */
  public async removeSession(sessionId: string): Promise<void> {
    const allSessions = await this.context.secrets.get(SESSIONS_KEY);
    if (allSessions) {
      let sessions = JSON.parse(allSessions) as AuthenticationSession[];
      const sessionIdx = sessions.findIndex(s => s.id === sessionId);
      const session = sessions[sessionIdx];
      sessions.splice(sessionIdx, 1);

      await this.context.secrets.store(SESSIONS_KEY, JSON.stringify(sessions));

      if (session) {
        this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });
      }
    }
  }

  /**
   * Dispose the registered services
   */
  public async dispose() {
    this._disposable.dispose();
  }

  /**
   * Log in to Auth0
   */
  private async login(scopes: string[] = []) {
    return await window.withProgress<string>({
      location: ProgressLocation.Notification,
      title: "Signing in to Software.com...",
      cancellable: true
    }, async (_, token) => {
      const stateId = uuid();

      this._pendingStates.push(stateId);

      const scopeString = scopes.join(' ');
      let params: URLSearchParams = getAuthQueryObject();
      params.append('response_type', 'token');
      params.append('redirect_uri', this.redirectUri);
      params.append('state', stateId);
      params.append('prompt', 'login');
      const uri = Uri.parse(`${app_url}/authorize?${params.toString()}`);
      await env.openExternal(uri);

      let codeExchangePromise = this._codeExchangePromises.get(scopeString);
      if (!codeExchangePromise) {
        codeExchangePromise = promiseFromEvent(this._uriHandler.event, this.handleUri(scopes));
        this._codeExchangePromises.set(scopeString, codeExchangePromise);
      }

      try {
        return await Promise.race([
          codeExchangePromise.promise,
          new Promise<string>((_, reject) => setTimeout(() => reject('Cancelled'), 120000)),
          promiseFromEvent<any, any>(token.onCancellationRequested, (_, __, reject) => { reject('Login Cancelled'); }).promise
        ]);
      } finally {
        this._pendingStates = this._pendingStates.filter(n => n !== stateId);
        codeExchangePromise?.cancel.fire();
        this._codeExchangePromises.delete(scopeString);
      }
    });
  }

  /**
   * Handle the redirect to VS Code (after sign in from Auth0)
   * @param scopes 
   * @returns 
   */
  private handleUri: (scopes: readonly string[]) => PromiseAdapter<Uri, string> =
    (scopes) => async (uri, resolve, reject) => {
      const query = new URLSearchParams(uri.query);
      const access_token = query.get('access_token');
      const state = query.get('state');

      if (!access_token) {
        reject(new Error('Authentication token not found'));
        return;
      }
      if (!state) {
        reject(new Error('Authentication state not found'));
        return;
      }

      // Check if it is a valid auth request started by the extension
      if (!this._pendingStates.some(n => n === state)) {
        reject(new Error('Authentication state not found'));
        return;
      }

      resolve(access_token);
    }
}

export interface PromiseAdapter<T, U> {
  (
    value: T,
    resolve:
      (value: U | PromiseLike<U>) => void,
    reject:
      (reason: any) => void
  ): any;
}

const passthrough = (value: any, resolve: (value?: any) => void) => resolve(value);

/**
 * Return a promise that resolves with the next emitted event, or with some future
 * event as decided by an adapter.
 *
 * If specified, the adapter is a function that will be called with
 * `(event, resolve, reject)`. It will be called once per event until it resolves or
 * rejects.
 *
 * The default adapter is the passthrough function `(value, resolve) => resolve(value)`.
 *
 * @param event the event
 * @param adapter controls resolution of the returned promise
 * @returns a promise that resolves or rejects as specified by the adapter
 */
export function promiseFromEvent<T, U>(event: Event<T>, adapter: PromiseAdapter<T, U> = passthrough): { promise: Promise<U>; cancel: EventEmitter<void> } {
  let subscription: Disposable;
  let cancel = new EventEmitter<void>();

  return {
    promise: new Promise<U>((resolve, reject) => {
      cancel.event(_ => reject('Cancelled'));
      subscription = event((value: T) => {
        try {
          Promise.resolve(adapter(value, resolve, reject))
            .catch(reject);
        } catch (error) {
          reject(error);
        }
      });
    }).then(
      (result: U) => {
        subscription.dispose();
        return result;
      },
      error => {
        subscription.dispose();
        throw error;
      }
    ),
    cancel
  };
}

