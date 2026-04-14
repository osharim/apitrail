export default function Page() {
  return (
    <main>
      <h1>apitrail example</h1>
      <p>
        <a href="/apitrail">→ open the dashboard</a>
      </p>
      <p>Try these endpoints first:</p>
      <ul>
        <li>
          <a href="/api/hello">GET /api/hello</a>
        </li>
        <li>
          <a href="/api/users">GET /api/users</a>
        </li>
        <li>
          <a href="/api/boom">GET /api/boom (throws)</a>
        </li>
      </ul>
    </main>
  )
}
