export async function GET() {
  await new Promise((r) => setTimeout(r, 50))
  return Response.json([
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
  ])
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  return Response.json({ created: true, received: body }, { status: 201 })
}
