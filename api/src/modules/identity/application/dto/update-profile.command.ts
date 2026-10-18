export interface UpdateProfileCommand {
  userId: string;
  displayName?: string;
  title?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  representativeName?: string | null;
  avatarUrl?: string | null;
}

export interface ChangePasswordCommand {
  userId: string;
  currentPassword: string;
  newPassword: string;
}
