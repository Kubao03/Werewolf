// Role image helper functions
export const ROLE_IMAGES: Record<number, string> = {
  0: '/images/roles/Villager.png',  // Villager
  1: '/images/roles/Werewolf.png',  // Wolf
  2: '/images/roles/Seer.png',      // Seer
  3: '/images/roles/Hunter.png',    // Hunter
  4: '/images/roles/Witch.png',     // Witch
};

/**
 * Get the image path for a role by its index
 * @param roleIndex Role index (0-4)
 * @returns Image path or null if role is invalid
 */
export function getRoleImage(roleIndex: number | null): string | null {
  if (roleIndex === null || roleIndex < 0 || roleIndex > 4) {
    return null;
  }
  return ROLE_IMAGES[roleIndex] || null;
}

