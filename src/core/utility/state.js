/**
 * Global bot state (in-memory)
 * Controls maintenance mode and allowed users
 */

const state = {
  // 🟢 Bot active by default
  isActive: true,

  // 👑 Users who can bypass maintenance mode
  owners: [
    '1168285714732036096'
  ],

  /**
   * Check if a user can bypass maintenance mode
   * @param {string} userId
   * @returns {boolean}
   */
  isOwner(userId) {
    return this.owners.includes(userId);
  },

  /**
   * Check if bot should block this user
   * @param {string} userId
   * @returns {boolean}
   */
  shouldBlock(userId) {
    return !this.isActive && !this.isOwner(userId);
  },

  /**
   * Toggle bot active state
   */
  toggle() {
    this.isActive = !this.isActive;
    return this.isActive;
  },

  /**
   * Force set state
   * @param {boolean} value
   */
  set(value) {
    this.isActive = value;
  }
};

module.exports = state;