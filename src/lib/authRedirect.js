// Where to go after signing in: the /app page the user originally asked for
// (passed as location.state.from by the route guards in App.jsx), otherwise
// the dashboard. Only /app paths are honoured, so the state can't send a user
// somewhere unexpected.
export function afterLoginPath(location) {
  const from = location.state?.from
  return from && from.pathname.startsWith('/app') ? `${from.pathname}${from.search || ''}` : '/app/'
}
