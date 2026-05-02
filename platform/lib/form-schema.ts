import { z } from "zod"

// Contact form schema
export const contactFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  company: z.string().optional(),
  employees: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
  agree: z.boolean().refine(val => val === true, "You must agree to the terms"),
})

export type ContactFormData = z.infer<typeof contactFormSchema>

// Sign up form schema
export const signUpFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

export type SignUpFormData = z.infer<typeof signUpFormSchema>

// Sign in form schema
export const signInFormSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

export type SignInFormData = z.infer<typeof signInFormSchema>

// Organization setup schema
export const organizationSetupSchema = z.object({
  organizationName: z.string().min(2, "Organization name must be at least 2 characters"),
  organizationSlug: z.string()
    .min(3, "Organization slug must be at least 3 characters")
    .max(50, "Organization slug must be less than 50 characters")
    .regex(/^[a-z0-9-]+$/, "Organization slug can only contain lowercase letters, numbers, and hyphens")
    .refine((slug) => !slug.startsWith('-') && !slug.endsWith('-'), {
      message: "Organization slug cannot start or end with a hyphen",
    }),
})

export type OrganizationSetupData = z.infer<typeof organizationSetupSchema>

// Profile update schema
export const profileUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
})

export type ProfileUpdateData = z.infer<typeof profileUpdateSchema>

// Team invitation schema
export const teamInvitationSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["admin", "member"]),
})

export type TeamInvitationData = z.infer<typeof teamInvitationSchema>

// Team management schemas
export const inviteMemberSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["admin", "member"]),
  organizationId: z.string().uuid("Invalid organization ID"),
})

export type InviteMemberData = z.infer<typeof inviteMemberSchema>

export const updateMemberRoleSchema = z.object({
  memberId: z.string().uuid("Invalid member ID"),
  role: z.enum(["admin", "member"]),
  organizationId: z.string().uuid("Invalid organization ID"),
})

export type UpdateMemberRoleData = z.infer<typeof updateMemberRoleSchema>

export const removeMemberSchema = z.object({
  memberId: z.string().uuid("Invalid member ID"),
  organizationId: z.string().uuid("Invalid organization ID"),
})

export type RemoveMemberData = z.infer<typeof removeMemberSchema>

export const transferOwnershipSchema = z.object({
  newOwnerMemberId: z.string().uuid("Invalid member ID"),
  organizationId: z.string().uuid("Invalid organization ID"),
})

export type TransferOwnershipData = z.infer<typeof transferOwnershipSchema>

export const invitationActionSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation ID"),
  organizationId: z.string().uuid("Invalid organization ID"),
})

export type InvitationActionData = z.infer<typeof invitationActionSchema>

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
})

export type AcceptInvitationData = z.infer<typeof acceptInvitationSchema>

// Profile schemas
export const updateProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
})

export type UpdateProfileData = z.infer<typeof updateProfileSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/, 
      "Password must contain uppercase, lowercase, number, and special character"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

export type ChangePasswordData = z.infer<typeof changePasswordSchema>

export const updatePreferencesSchema = z.object({
  language: z.enum(["pt-BR", "en-US", "es-ES"]),
  theme: z.enum(["light", "dark", "system"]),
})

export type UpdatePreferencesData = z.infer<typeof updatePreferencesSchema>

export const enable2FASchema = z.object({
  verificationCode: z.string().length(6, "Verification code must be 6 digits")
    .regex(/^\d+$/, "Verification code must be numeric"),
  secret: z.string().min(1, "Secret is required"),
})

export type Enable2FAData = z.infer<typeof enable2FASchema>

export const disable2FASchema = z.object({
  password: z.string().min(1, "Password is required"),
})

export type Disable2FAData = z.infer<typeof disable2FASchema>

export const deleteAccountSchema = z.object({
  confirmText: z.string().refine((value) => value === "DELETE", {
    message: "You must type DELETE to confirm",
  }),
  password: z.string().min(1, "Password is required"),
})

export type DeleteAccountData = z.input<typeof deleteAccountSchema>

// Organization schemas
export const uploadLogoSchema = z.object({
  organizationId: z.string().uuid("Invalid organization ID"),
})

export type UploadLogoData = z.infer<typeof uploadLogoSchema>

export const deleteOrganizationSchema = z.object({
  organizationId: z.string().uuid("Invalid organization ID"),
  confirmText: z.string().min(1, "Confirmation text is required"),
})

export type DeleteOrganizationData = z.infer<typeof deleteOrganizationSchema>

// Repository schemas
export const deleteRepositorySchema = z.object({
  repositoryId: z.string().uuid("Invalid repository ID"),
  organizationId: z.string().uuid("Invalid organization ID"),
  confirmText: z.string().min(1, "Confirmation text is required"),
})

export type DeleteRepositoryData = z.infer<typeof deleteRepositorySchema>

// Default form schema (for backward compatibility)
export const formSchema = contactFormSchema
export type FormData = ContactFormData
