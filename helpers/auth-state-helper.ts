import { Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Helper to save and reuse authentication state
 * This lets you skip login in subsequent tests
 */
export class AuthStateHelper {
  private static authFile = path.join(__dirname, '../.auth-state.json');

  /**
   * Save authentication state to file
   */
  static async saveAuthState(context: BrowserContext) {
    await context.storageState({ path: this.authFile });
    console.log('✅ Auth state saved');
  }

  /**
   * Check if saved auth state exists
   */
  static hasAuthState(): boolean {
    return fs.existsSync(this.authFile);
  }

  /**
   * Load authentication state from file
   */
  static async loadAuthState(context: BrowserContext) {
    if (!this.hasAuthState()) {
      throw new Error('No saved auth state found. Run login first.');
    }
    
    await context.addCookies(
      JSON.parse(fs.readFileSync(this.authFile, 'utf-8')).cookies
    );
    console.log('✅ Auth state loaded');
  }

  /**
   * Delete saved auth state
   */
  static clearAuthState() {
    if (this.hasAuthState()) {
      fs.unlinkSync(this.authFile);
      console.log('✅ Auth state cleared');
    }
  }
}
