import { useEffect, useState } from 'react';

const API = (
  import.meta.env.VITE_API_URL || 'http://localhost:3000'
).replace(/\/$/, '');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ACCESS_TOKEN_KEY = 'bookify_access_token';

const PASS_RULES = [
  {
    id: 'length',
    label: 'At least 8 characters',
    passes: (password) => password.length >= 8
  },
  {
    id: 'upper',
    label: 'At least one uppercase letter',
    passes: (password) => /[A-Z]/.test(password)
  },
  {
    id: 'lower',
    label: 'At least one lowercase letter',
    passes: (password) => /[a-z]/.test(password)
  },
  {
    id: 'number',
    label: 'At least one number',
    passes: (password) => /\d/.test(password)
  }
];

// API REQUEST HANDLER

async function request(
  path,
  {
    method = 'GET',
    body,
    token
  } = {}
) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 25000);

  try {
    const response = await fetch(`${API}${path}`, {
      method,

      // Allow the browser to send and receive auth cookies
      credentials: 'include',

      headers: {
        ...(body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),

        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {})
      },

      body:
        body !== undefined
          ? JSON.stringify(body)
          : undefined,

      signal: controller.signal
    });

    const raw = await response.text();

    let data = {};

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = {};
      }
    }

    if (!response.ok) {
      const defaultMessages = {
        400: 'Bad Request. Please check your information.',
        401: 'Unauthorized. Your session may have expired.',
        403: 'Forbidden. You do not have permission.',
        404: 'Not Found. The requested resource was not found.',
        409: 'Conflict. The requested operation cannot be completed.',
        422: 'Unprocessable Entity. Please check your information.',
        429: 'Too Many Requests. Please try again later.',
        500: 'Internal Server Error. Something went wrong.',
        502: 'Bad Gateway. The server received an invalid response.',
        503: 'Service Unavailable. Please try again later.',
        504: 'Gateway Timeout. The server took too long to respond.'
      };

      const error = new Error(
        data.message ||
        defaultMessages[response.status] ||
        `HTTP Error ${response.status}`
      );

      error.status = response.status;

      throw error;
    }

    return data;

  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        'Request Timeout. The server took too long to respond.'
      );
    }

    if (error instanceof TypeError) {
      throw new Error(
        'Connection Error. Unable to connect to the BOOKIFY server.'
      );
    }

    throw error;

  } finally {
    clearTimeout(timeoutId);
  }
}

// ACCESS TOKEN MANAGEMENT

function saveAccessToken(token) {
  if (token) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

// Decode JWT expiration without trusting it for authorization
function getTokenExpiration(token) {
  try {
    const payload = token.split('.')[1];

    if (!payload) {
      return null;
    }

    const normalized = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const decoded = JSON.parse(atob(normalized));

    if (typeof decoded.exp !== 'number') {
      return null;
    }

    return decoded.exp * 1000;

  } catch {
    return null;
  }
}

// REFRESH TOKEN MANAGEMENT

let refreshPromise = null;

// Prevent simultaneous refresh requests
function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = request('/api/auth/refresh', {
      method: 'POST'
    }).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

// Retry a protected request after refreshing an expired JWT
async function authenticatedRequest(
  path,
  {
    token,
    onTokenRefreshed,
    method = 'GET',
    body
  }
) {
  try {
    return await request(path, {
      method,
      body,
      token
    });

  } catch (error) {
    if (error.status !== 401) {
      throw error;
    }

    // Ask the backend for a new access token
    const refreshed = await refreshSession();

    if (!refreshed.accessToken) {
      throw new Error('Unable to renew the session.');
    }

    saveAccessToken(refreshed.accessToken);

    if (onTokenRefreshed) {
      onTokenRefreshed(
        refreshed.accessToken,
        refreshed.user || null
      );
    }

    // Retry the original request once
    return request(path, {
      method,
      body,
      token: refreshed.accessToken
    });
  }
}

// ICON COMPONENT

function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  };

  if (name === 'eye') {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (name === 'eye-off') {
    return (
      <svg {...common}>
        <path d="m3 3 18 18" />
        <path d="M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-4.1 4.7M6.4 6.5A15.6 15.6 0 0 0 2 12s3.5 7 10 7a10.5 10.5 0" />
        <path d="M10 10a3 3 0 0 0 4 4" />
      </svg>
    );
  }

  if (name === 'arrow') {
    return (
      <svg {...common}>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </svg>
    );
  }

  if (name === 'check') {
    return (
      <svg {...common}>
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }

  if (name === 'calendar') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4M17 3v4M3 10h18m-12 5h6" />
      </svg>
    );
  }

  if (name === 'scissors') {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="m8.4 8.4 12.2 12.2M14.5 9.5 20.6 3.4M8.4 15.6 12 12" />
      </svg>
    );
  }

  if (name === 'sparkle') {
    return (
      <svg {...common}>
        <path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z" />
      </svg>
    );
  }

  if (name === 'shield') {
    return (
      <svg {...common}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }

  return null;
}

// BOOKIFY BRAND

function Brand({ light = false }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-mark">
        <Icon name="calendar" size={23} />
      </span>

      <span>
        bookify<span className="brand-dot">.</span>
      </span>
    </div>
  );
}

// FORM FIELD

function Field({
  id,
  label,
  error,
  type = 'text',
  value,
  onChange,
  autoComplete,
  placeholder,
  trailing,
  ...rest
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
      </label>

      <div className={`input-wrap ${error ? 'has-error' : ''}`}>
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${id}-error` : undefined
          }
          {...rest}
        />

        {trailing}
      </div>

      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

// PASSWORD FIELD

function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete = 'current-password',
  placeholder = '••••••••'
}) {
  const [show, setShow] = useState(false);

  return (
    <Field
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      error={error}
      type={show ? 'text' : 'password'}
      autoComplete={autoComplete}
      placeholder={placeholder}
      trailing={
        <button
          type="button"
          className="eye-button"
          aria-label={
            show ? 'Hide password' : 'Show password'
          }
          onClick={() => setShow(value => !value)}
        >
          <Icon
            name={show ? 'eye-off' : 'eye'}
            size={18}
          />
        </button>
      }
    />
  );
}

// FORM VALIDATION

function validate(mode, form) {
  const errors = {};

  if (mode === 'register') {
    const fullName = form.full_name.trim();

    if (!fullName) {
      errors.full_name = 'Please enter your full name.';

    } else if (fullName.length < 3) {
      errors.full_name =
        'Your name must contain at least 3 characters.';

    } else if (fullName.length > 100) {
      errors.full_name =
        'Your name cannot exceed 100 characters.';
    }
  }

  if (!form.email.trim()) {
    errors.email = 'Please enter your email address.';

  } else if (!EMAIL_RE.test(form.email.trim())) {
    errors.email =
      'Please enter a valid email address.';

  } else if (form.email.trim().length > 254) {
    errors.email =
      'Your email address is too long.';
  }

  if (!form.password) {
    errors.password = 'Please enter your password.';

  } else if (mode === 'register') {
    const validRules = PASS_RULES.every(
      rule => rule.passes(form.password)
    );

    if (!validRules) {
      errors.password =
        'Your password does not meet the security requirements.';

    } else if (
      new TextEncoder().encode(form.password).length > 72
    ) {
      errors.password =
        'Your password cannot exceed 72 bytes.';
    }
  }

  if (mode === 'register') {
    if (!form.confirmPassword) {
      errors.confirmPassword =
        'Please confirm your password.';

    } else if (
      form.password !== form.confirmPassword
    ) {
      errors.confirmPassword =
        'Passwords do not match.';
    }
  }

  return errors;
}

// LOGIN AND REGISTER PAGE

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (name) => (event) => {
    const value = event.target.value;

    setForm(current => ({
      ...current,
      [name]: value
    }));

    setErrors(current => ({
      ...current,
      [name]: undefined
    }));

    setNotice(null);
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);

    setErrors({});
    setNotice(null);

    setForm(current => ({
      ...current,
      password: '',
      confirmPassword: ''
    }));
  };

  // Register or log in
  const onSubmit = async (event) => {
    event.preventDefault();

    setNotice(null);

    const invalid = validate(mode, form);

    setErrors(invalid);

    if (Object.keys(invalid).length > 0) {
      return;
    }

    setBusy(true);

    try {
      if (mode === 'register') {
        // Register a new CLIENT account
        const result = await request(
          '/api/auth/register',
          {
            method: 'POST',
            body: {
              full_name: form.full_name.trim(),
              email: form.email.trim().toLowerCase(),
              password: form.password
            }
          }
        );

        // Return to the login form
        setMode('login');

        setForm(current => ({
          ...current,
          password: '',
          confirmPassword: ''
        }));

        setErrors({});

        setNotice({
          type: 'success',
          text:
            result.message ||
            'Account created successfully. You can now sign in.'
        });

      } else {
        // Authenticate with the backend
        const result = await request(
          '/api/auth/login',
          {
            method: 'POST',
            body: {
              email: form.email.trim().toLowerCase(),
              password: form.password
            }
          }
        );

        if (!result.accessToken) {
          throw new Error(
            'Authentication failed. The server did not return an access token.'
          );
        }

        // Store only the access token
        saveAccessToken(result.accessToken);

        // The refresh token is stored in an HttpOnly cookie
        onAuthenticated(
          result.accessToken,
          result.user || null
        );
      }

    } catch (error) {
      setNotice({
        type: 'error',
        text: error.message
      });

    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">

      {/* LEFT PANEL */}

      <aside className="hero-panel">

        <div className="hero-top">
          <Brand light />

          <span className="hero-meta">
            Your time matters
          </span>
        </div>

        <div className="hero-content">

          <div className="eyebrow">
            <span className="eyebrow-line" />
            THE SMARTER WAY TO BOOK
          </div>

          <h1>
            Your best self<br />
            starts with <em>time.</em>
          </h1>

          <p>
            Discover barbershops, beauty salons, spas,
            and wellness services. Book what you need,
            whenever you need it.
          </p>

          <div className="feature-grid">

            <div className="feature-tile">
              <span>
                <Icon name="scissors" size={24} />
              </span>

              <strong>Barbershops</strong>
              <small>Your style, your schedule</small>
            </div>

            <div className="feature-tile">
              <span>
                <Icon name="sparkle" size={24} />
              </span>

              <strong>Beauty & Spa</strong>
              <small>Moments just for you</small>
            </div>

            <div className="feature-tile">
              <span>
                <Icon name="calendar" size={24} />
              </span>

              <strong>Easy Booking</strong>
              <small>Just a few steps away</small>
            </div>

          </div>
        </div>

        <div className="hero-bottom">
          <span className="tiny-orb" />
          BOOKIFY · Booking Platform
        </div>

        <div className="hero-decoration deco-one" />
        <div className="hero-decoration deco-two" />

      </aside>

      {/* RIGHT PANEL */}

      <main className="form-panel">

        <div className="mobile-brand">
          <Brand />
        </div>

        <div className="form-container">

          <div className="auth-label">
            <span className="auth-label-dot" />
            WELCOME TO BOOKIFY
          </div>

          <h2>
            {mode === 'login'
              ? 'Great to see you again!'
              : 'Create your account'}
          </h2>

          <p className="form-lead">
            {mode === 'login'
              ? 'Sign in to your account and start booking.'
              : 'Join BOOKIFY and discover your next great experience.'}
          </p>

          {/* LOGIN / REGISTER TABS */}

          <div
            className="auth-tabs"
            role="tablist"
            aria-label="Select authentication form"
          >

            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'active' : ''}
              onClick={() => changeMode('login')}
              disabled={busy}
            >
              Sign In
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'active' : ''}
              onClick={() => changeMode('register')}
              disabled={busy}
            >
              Sign Up
            </button>

          </div>

          {/* MESSAGES */}

          {notice && (
            <div
              className={`notice notice-${notice.type}`}
              role="alert"
            >
              {notice.type === 'success' ? '✓' : '!'}

              <span>
                {notice.text}
              </span>
            </div>
          )}

          {/* FORM */}

          <form noValidate onSubmit={onSubmit}>

            {mode === 'register' && (
              <Field
                id="full_name"
                label="Full Name"
                value={form.full_name}
                onChange={update('full_name')}
                error={errors.full_name}
                placeholder="e.g. John Smith"
                autoComplete="name"
                maxLength={100}
              />
            )}

            <Field
              id="email"
              label="Email Address"
              type="email"
              value={form.email}
              onChange={update('email')}
              error={errors.email}
              placeholder="name@example.com"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
            />

            <PasswordField
              id="password"
              label="Password"
              value={form.password}
              onChange={update('password')}
              error={errors.password}
              autoComplete={
                mode === 'login'
                  ? 'current-password'
                  : 'new-password'
              }
            />

            {mode === 'register' && (
              <>

                <div
                  className="password-rules"
                  aria-label="Password requirements"
                >

                  {PASS_RULES.map(rule => (
                    <div
                      key={rule.id}
                      className={
                        rule.passes(form.password)
                          ? 'rule met'
                          : 'rule'
                      }
                    >
                      <span>
                        {rule.passes(form.password)
                          ? (
                              <Icon
                                name="check"
                                size={12}
                              />
                            )
                          : '·'}
                      </span>

                      {rule.label}
                    </div>
                  ))}

                </div>

                <PasswordField
                  id="confirmPassword"
                  label="Confirm Password"
                  value={form.confirmPassword}
                  onChange={update('confirmPassword')}
                  error={errors.confirmPassword}
                  autoComplete="new-password"
                />

              </>
            )}

            <button
              className="submit-button"
              type="submit"
              disabled={busy}
            >
              <span>
                {busy
                  ? 'Processing...'
                  : mode === 'login'
                    ? 'Sign In to BOOKIFY'
                    : 'Create My Account'}
              </span>

              {!busy && (
                <Icon name="arrow" size={19} />
              )}
            </button>

          </form>

          <p className="form-switch">

            {mode === 'login'
              ? "Don't have an account yet?"
              : 'Already have an account?'}

            {' '}

            <button
              type="button"
              onClick={() => {
                changeMode(
                  mode === 'login'
                    ? 'register'
                    : 'login'
                );
              }}
              disabled={busy}
            >
              {mode === 'login'
                ? 'Sign Up Here'
                : 'Sign In'}
            </button>

          </p>

        </div>

        <div className="form-footer">
          <Icon name="shield" size={16} />
          Your information is protected · BOOKIFY 2026
        </div>

      </main>
    </div>
  );
}

// AUTHENTICATED DASHBOARD

function Dashboard({
  token,
  initialUser,
  onTokenRefreshed,
  onRefresh,
  onLogout,
  onLogoutAll
}) {
  const [user, setUser] = useState(initialUser);

  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busyAction, setBusyAction] = useState('');

  // Verify the authenticated user
  useEffect(() => {
    let active = true;

    setPending(true);
    setError('');

    authenticatedRequest(
      '/api/auth/me',
      {
        token,

        onTokenRefreshed: (
          nextToken,
          nextUser
        ) => {
          if (active) {
            onTokenRefreshed(
              nextToken,
              nextUser
            );
          }
        }
      }
    )
      .then(result => {
        if (!active) {
          return;
        }

        setUser(result.user || null);
      })
      .catch(err => {
        if (active) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (active) {
          setPending(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token, onTokenRefreshed]);

  const fullName =
    user?.full_name ||
    initialUser?.full_name ||
    'BOOKIFY Client';

  // Manually refresh the current session
  const handleRefresh = async () => {
    setBusyAction('refresh');
    setNotice(null);

    try {
      const result = await onRefresh();

      setUser(result.user || null);

      setNotice({
        type: 'success',
        text: 'Session refreshed successfully.'
      });

    } catch (err) {
      setNotice({
        type: 'error',
        text: err.message
      });

    } finally {
      setBusyAction('');
    }
  };

  // Log out of the current session
  const handleLogout = async () => {
    setBusyAction('logout');
    setNotice(null);

    try {
      await onLogout();

    } catch (err) {
      setNotice({
        type: 'error',
        text: err.message
      });

    } finally {
      setBusyAction('');
    }
  };

  // Revoke all renewable sessions
  const handleLogoutAll = async () => {
    setBusyAction('logout-all');
    setNotice(null);

    try {
      await onLogoutAll();

    } catch (err) {
      setNotice({
        type: 'error',
        text: err.message
      });

    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="dashboard-page">

      <header className="dash-header">

        <Brand />

        <button
          className="logout-button"
          onClick={handleLogout}
          disabled={Boolean(busyAction)}
        >
          {busyAction === 'logout'
            ? 'Signing Out...'
            : 'Sign Out'}

          <Icon name="arrow" size={16} />
        </button>

      </header>

      <main className="dash-main">

        <div className="success-icon">
          <Icon name="check" size={30} />
        </div>

        <span className="dash-eyebrow">
          AUTHENTICATED SESSION
        </span>

        <h1>
          Welcome to BOOKIFY!
        </h1>

        <p>
          You have successfully signed in using the
          Node.js backend and an account stored in Supabase.
        </p>

        <div className="dash-card">

          <div className="dash-card-head">
            <Icon name="shield" size={20} />

            <strong>
              Protected Route Verification
            </strong>
          </div>

          <div className="detail-row">
            <span>Endpoint</span>
            <code>GET /api/auth/me</code>
          </div>

          <div className="detail-row">
            <span>Status</span>

            <strong
              className={
                error
                  ? 'text-error'
                  : 'text-success'
              }
            >
              {pending
                ? 'Validating token...'
                : error
                  ? 'Verification Failed'
                  : '200 OK · Valid JWT'}
            </strong>
          </div>

          <div className="detail-row">
            <span>User</span>
            <strong>{fullName}</strong>
          </div>

          <div className="detail-row">
            <span>Email</span>
            <strong>
              {user?.email || initialUser?.email || '—'}
            </strong>
          </div>

          <div className="detail-row">
            <span>Role</span>
            <strong>
              {user?.role || initialUser?.role || '—'}
            </strong>
          </div>

          <div className="detail-row">
            <span>Authentication</span>
            <strong className="text-success">
              JWT + Refresh Token
            </strong>
          </div>

          <div className="detail-row">
            <span>Refresh Token</span>
            <strong className="text-success">
              HttpOnly Cookie
            </strong>
          </div>

          {error && (
            <div className="notice notice-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div
              className={`notice notice-${notice.type}`}
              role="alert"
            >
              <span>{notice.text}</span>
            </div>
          )}

        </div>

        {/* SESSION MANAGEMENT */}

        <div className="dash-card">

          <div className="dash-card-head">
            <Icon name="shield" size={20} />

            <strong>
              Session Management
            </strong>
          </div>

          <p>
            Your access token is renewed automatically
            before it expires. You can also renew your
            session manually to test the refresh token.
          </p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '20px'
            }}
          >

            <button
              type="button"
              className="submit-button"
              onClick={handleRefresh}
              disabled={Boolean(busyAction)}
              style={{
                width: 'auto',
                padding: '12px 20px'
              }}
            >
              {busyAction === 'refresh'
                ? 'Refreshing...'
                : 'Refresh Session'}
            </button>

            <button
              type="button"
              className="logout-button"
              onClick={handleLogoutAll}
              disabled={Boolean(busyAction)}
              style={{
                padding: '12px 20px'
              }}
            >
              {busyAction === 'logout-all'
                ? 'Revoking Sessions...'
                : 'Sign Out All Devices'}
            </button>

          </div>

        </div>

        <div className="dash-note">
          <Icon name="calendar" size={18} />
          Coming Soon: Business Catalog, Services,
          and Reservations.
        </div>

      </main>
    </div>
  );
}

// MAIN APPLICATION

export default function App() {
  const [token, setToken] = useState('');

  const [user, setUser] = useState(null);

  const [checkingSession, setCheckingSession] = useState(true);

  // Update the active access token
  const updateSession = (nextToken, nextUser) => {
    saveAccessToken(nextToken);

    setToken(nextToken);
    setUser(nextUser);
  };

  // Restore a session when the application starts
  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      try {
        const result = await refreshSession();

        if (!active) {
          return;
        }

        if (!result.accessToken) {
          throw new Error('Unable to restore the session.');
        }

        saveAccessToken(result.accessToken);

        setToken(result.accessToken);
        setUser(result.user || null);

      } catch {
        if (!active) {
          return;
        }

        saveAccessToken('');

        setToken('');
        setUser(null);

      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    };

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  // Automatically renew the token before expiration
  useEffect(() => {
    if (!token || checkingSession) {
      return;
    }

    const expiresAt = getTokenExpiration(token);

    if (!expiresAt) {
      return;
    }

    // Renew the JWT one minute before expiration
    const millisecondsUntilRefresh = Math.max(
      1000,
      expiresAt - Date.now() - 60000
    );

    let active = true;

    const timer = setTimeout(async () => {
      try {
        const result = await refreshSession();

        if (!active) {
          return;
        }

        if (!result.accessToken) {
          throw new Error('Unable to renew the session.');
        }

        saveAccessToken(result.accessToken);

        setToken(result.accessToken);
        setUser(result.user || null);

      } catch (error) {
        if (!active) {
          return;
        }

        console.error(
          'Automatic session refresh failed:',
          error.message
        );

        saveAccessToken('');

        setToken('');
        setUser(null);
      }
    }, millisecondsUntilRefresh);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token, checkingSession]);

  // Refresh the session manually
  const handleRefresh = async () => {
    const result = await refreshSession();

    if (!result.accessToken) {
      throw new Error('Unable to renew the session.');
    }

    updateSession(
      result.accessToken,
      result.user || null
    );

    return result;
  };

  // Log out of the current session
  const handleLogout = async () => {
    await request('/api/auth/logout', {
      method: 'POST'
    });

    updateSession('', null);
  };

  // Revoke all renewable sessions
  const handleLogoutAll = async () => {
    await authenticatedRequest(
      '/api/auth/logout-all',
      {
        token,

        method: 'POST',

        onTokenRefreshed: (
          nextToken,
          nextUser
        ) => {
          updateSession(nextToken, nextUser);
        }
      }
    );

    updateSession('', null);
  };

  // Show a loading state during session restoration
  if (checkingSession) {
    return (
      <div className="auth-shell">
        <div
          style={{
            margin: 'auto',
            padding: '40px',
            textAlign: 'center',
            fontSize: '18px'
          }}
        >
          Restoring your BOOKIFY session...
        </div>
      </div>
    );
  }

  // Render the dashboard when authenticated
  if (token) {
    return (
      <Dashboard
        token={token}
        initialUser={user}
        onTokenRefreshed={updateSession}
        onRefresh={handleRefresh}
        onLogout={handleLogout}
        onLogoutAll={handleLogoutAll}
      />
    );
  }

  // Render login and registration forms
  return (
    <AuthPage
      onAuthenticated={updateSession}
    />
  );
}