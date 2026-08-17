(function () {
  'use strict';

  const FALLBACK_ADMIN_PATH = 'admin/command-center.html';
  const scriptUrl = document.currentScript && document.currentScript.src
    ? new URL(document.currentScript.src)
    : new URL('assets/js/auth.js', window.location.href);
  const siteRootUrl = new URL('../../', scriptUrl);

  let state = createState('loading', 'Checking organizer access…');
  let initializationPromise = null;
  let authSubscription = null;
  let authorizationSequence = 0;
  let scheduledRefresh = null;
  let authOperationInProgress = null;
  const listeners = new Set();

  function createState(status, message, details) {
    const safeDetails = details || {};
    return Object.freeze({
      status,
      userId: safeDetails.userId || null,
      fullName: safeDetails.fullName || '',
      role: safeDetails.role || null,
      active: safeDetails.active === true,
      message
    });
  }

  function getClient() {
    if (typeof sb === 'undefined' || !sb || !sb.auth) {
      throw new Error('The shared Supabase client is unavailable.');
    }
    return sb;
  }

  function publish(nextState) {
    state = nextState;
    listeners.forEach((callback) => {
      try {
        callback(getState());
      } catch (error) {
        console.error('An OrleansAuth state listener failed.', {
          name: error && error.name ? error.name : 'Error'
        });
      }
    });
    return getState();
  }

  function getState() {
    return { ...state };
  }

  function logDiagnostic(message, error) {
    console.error(message, {
      name: error && error.name ? error.name : 'Error',
      status: typeof error?.status === 'number' ? error.status : undefined,
      code: typeof error?.code === 'string' ? error.code : undefined
    });
  }

  function isNetworkError(error) {
    return error instanceof TypeError || error?.name === 'NetworkError';
  }

  async function authorizeCurrentUser(options) {
    const sequence = ++authorizationSequence;
    const reason = options?.reason || 'session-check';

    try {
      const client = getClient();
      const { data: userData, error: userError } = await client.auth.getUser();

      if (sequence !== authorizationSequence) return getState();

      if (userError || !userData?.user) {
        if (userError) logDiagnostic(`OrleansAuth ${reason} user validation failed.`, userError);
        return publish(createState('anonymous', options?.expired
          ? 'Your session expired. Please sign in again.'
          : 'Please sign in to continue.'));
      }

      const user = userData.user;
      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('id,role,active,full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (sequence !== authorizationSequence) return getState();

      if (profileError) {
        logDiagnostic(`OrleansAuth ${reason} profile lookup failed.`, profileError);
        return publish(createState('error', 'The service could not be reached. Please try again.', {
          userId: user.id
        }));
      }

      const safeProfile = {
        userId: user.id,
        fullName: typeof profile?.full_name === 'string' ? profile.full_name : '',
        role: typeof profile?.role === 'string' ? profile.role : null,
        active: profile?.active === true
      };

      if (
        profile?.id === user.id &&
        profile.active === true &&
        profile.role === 'admin'
      ) {
        return publish(createState('authorized', 'Organizer authentication succeeded.', safeProfile));
      }

      return publish(createState(
        'unauthorized',
        'Your account does not have organizer access.',
        safeProfile
      ));
    } catch (error) {
      if (sequence !== authorizationSequence) return getState();
      logDiagnostic(`OrleansAuth ${reason} failed.`, error);
      return publish(createState(
        'error',
        isNetworkError(error)
          ? 'The service could not be reached. Please try again.'
          : 'The service could not be reached. Please try again.'
      ));
    }
  }

  function scheduleAuthorizationRefresh(event, session) {
    if (event === 'INITIAL_SESSION') return;
    if (authOperationInProgress === 'sign-in' && event === 'SIGNED_IN') return;
    if (authOperationInProgress === 'sign-out' && event === 'SIGNED_OUT') return;
    if (scheduledRefresh) window.clearTimeout(scheduledRefresh);

    scheduledRefresh = window.setTimeout(async () => {
      scheduledRefresh = null;

      if (event === 'SIGNED_OUT' || !session) {
        authorizationSequence += 1;
        publish(createState(
          'anonymous',
          event === 'SIGNED_OUT'
            ? 'Please sign in to continue.'
            : 'Your session expired. Please sign in again.'
        ));
        return;
      }

      await authorizeCurrentUser({ reason: `auth-event-${String(event).toLowerCase()}` });
    }, 0);
  }

  function subscribeToAuthChanges() {
    if (authSubscription) return;

    const client = getClient();
    const { data } = client.auth.onAuthStateChange((event, session) => {
      scheduleAuthorizationRefresh(event, session);
    });
    authSubscription = data?.subscription || true;
  }

  function initialize() {
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
      publish(createState('loading', 'Checking organizer access…'));

      try {
        const client = getClient();
        const { data, error } = await client.auth.getSession();

        if (error) {
          logDiagnostic('OrleansAuth session lookup failed.', error);
          return publish(createState('error', 'The service could not be reached. Please try again.'));
        }

        subscribeToAuthChanges();

        if (!data?.session) {
          authorizationSequence += 1;
          return publish(createState('anonymous', 'Please sign in to continue.'));
        }

        return authorizeCurrentUser({ reason: 'initialization' });
      } catch (error) {
        logDiagnostic('OrleansAuth initialization failed.', error);
        return publish(createState('error', 'The service could not be reached. Please try again.'));
      }
    })();

    return initializationPromise;
  }

  async function signIn(email, password) {
    await initialize();
    publish(createState('loading', 'Signing in…'));
    authOperationInProgress = 'sign-in';

    try {
      const client = getClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });

      if (error || !data?.user) {
        if (error) logDiagnostic('OrleansAuth sign-in was rejected.', error);
        authorizationSequence += 1;
        return publish(createState('anonymous', 'The email or password was not accepted.'));
      }

      return authorizeCurrentUser({ reason: 'sign-in' });
    } catch (error) {
      logDiagnostic('OrleansAuth sign-in failed.', error);
      return publish(createState('error', 'The service could not be reached. Please try again.'));
    } finally {
      authOperationInProgress = null;
    }
  }

  async function signOut() {
    await initialize();
    publish(createState('loading', 'Signing out…'));
    authOperationInProgress = 'sign-out';

    try {
      const client = getClient();
      const { error } = await client.auth.signOut();

      if (error) {
        logDiagnostic('OrleansAuth sign-out failed.', error);
        return publish(createState('error', 'The service could not be reached. Please try again.'));
      }

      authorizationSequence += 1;
      return publish(createState('anonymous', 'Please sign in to continue.'));
    } catch (error) {
      logDiagnostic('OrleansAuth sign-out failed.', error);
      return publish(createState('error', 'The service could not be reached. Please try again.'));
    } finally {
      authOperationInProgress = null;
    }
  }

  function validateAdminPath(candidate) {
    if (typeof candidate !== 'string' || candidate.length === 0) return null;
    if (candidate !== candidate.trim()) return null;
    if (/^[a-z][a-z\d+.-]*:/i.test(candidate)) return null;
    if (candidate.startsWith('/') || candidate.startsWith('//')) return null;
    if (candidate.includes('\\') || /%5c/i.test(candidate)) return null;
    if (/[\u0000-\u001f\u007f]/.test(candidate)) return null;
    if (/(^|\/)\.\.?($|[/?#])/.test(candidate) || /%2e/i.test(candidate)) return null;

    let resolved;
    try {
      resolved = new URL(candidate, siteRootUrl);
    } catch (error) {
      return null;
    }

    const adminRoot = new URL('admin/', siteRootUrl);
    if (resolved.origin !== siteRootUrl.origin) return null;
    if (!resolved.pathname.startsWith(adminRoot.pathname)) return null;

    return `${resolved.pathname.slice(siteRootUrl.pathname.length)}${resolved.search}${resolved.hash}`;
  }

  function getSafeReturnPath() {
    const next = new URL(window.location.href).searchParams.get('next');
    return validateAdminPath(next) || FALLBACK_ADMIN_PATH;
  }

  async function requireAdmin(options) {
    const currentState = await initialize();

    if (currentState.status === 'authorized') {
      return { authorized: true, redirected: false, state: getState() };
    }

    if (currentState.status !== 'anonymous') {
      return { authorized: false, redirected: false, state: getState() };
    }

    const currentPath = `${window.location.pathname.slice(siteRootUrl.pathname.length)}${window.location.search}${window.location.hash}`;
    const safeCurrentPath = validateAdminPath(currentPath);
    const loginUrl = options?.loginUrl
      ? new URL(options.loginUrl, window.location.href)
      : new URL('login.html', siteRootUrl);

    if (safeCurrentPath) loginUrl.searchParams.set('next', safeCurrentPath);
    window.location.assign(loginUrl.href);

    return { authorized: false, redirected: true, state: getState() };
  }

  function onStateChange(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('OrleansAuth.onStateChange requires a callback.');
    }

    listeners.add(callback);
    callback(getState());
    return function unsubscribe() {
      listeners.delete(callback);
    };
  }

  window.OrleansAuth = Object.freeze({
    initialize,
    signIn,
    signOut,
    requireAdmin,
    getState,
    onStateChange,
    getSafeReturnPath
  });
})();
