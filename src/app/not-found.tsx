import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 text-white p-8">
      <h2 className="text-4xl font-bold mb-2">404</h2>
      <p className="text-gray-400 mb-6 text-center max-w-md">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
        Back to Home
      </Link>
    </div>
  )
}
