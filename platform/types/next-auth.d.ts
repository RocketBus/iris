declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      organizations?: Array<{
        id: string
        name: string
        slug: string
        plan: string
        role: string
      }>
      preferences?: {
        language?: string
        theme?: string
      }
      themePreference?: string
    }
  }

  interface User {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
  }
}
