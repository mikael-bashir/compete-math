
export type User = {
	id: string;
	username: string;
	iat?: number;
	email?: string;
	emailVerified?: Date | null;
	badgeUrl?: string;
	// Whether the equipped badge is frameless prestige art (skip the avatar circle).
	badgeNoBorder?: boolean;
	// Equipped title's prestige styling (null = plain title). Drives the
	// gradient+shimmer applied to the user's NAME across the app.
	titleColorFrom?: string | null;
	titleColorTo?: string | null;
	titleTextColor?: string | null;
}
