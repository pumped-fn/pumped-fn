import { executes } from "@pumped-fn/core-next";

const {
  ok,
  ko,
  safe,
  safeAsync,
  parallel,
  chain,
  chainAsync,
  map,
  combine,
  Service
} = executes;

type Result<T, E = unknown> = executes.Result<T, E>;

// =============================================================================
// Traditional Service Definitions (throwing functions)
// =============================================================================

const rawUserService = {
  findUser: async (id: string) => {
    if (!id) throw new Error("User ID is required");
    if (id === "404") throw new Error("User not found");
    return { id, name: "John Doe", email: "john@example.com", active: true };
  },

  updateUser: async (id: string, updates: any) => {
    if (!id) throw new Error("User ID is required");
    if (!updates.name) throw new Error("Name is required");
    return { id, ...updates, updatedAt: new Date().toISOString() };
  },

  deleteUser: async (id: string) => {
    if (!id) throw new Error("User ID is required");
    if (id === "admin") throw new Error("Cannot delete admin user");
    return { id, deleted: true };
  }
};

const rawNotificationService = {
  sendEmail: async (to: string, subject: string, body: string) => {
    if (!to.includes("@")) throw new Error("Invalid email address");
    // Simulate random failure
    if (Math.random() < 0.2) throw new Error("Email service temporarily unavailable");
    return { sent: true, to, subject, messageId: `msg_${Date.now()}` };
  },

  sendSMS: async (phone: string, message: string) => {
    if (!phone.startsWith("+")) throw new Error("Phone must include country code");
    return { sent: true, phone, message, messageId: `sms_${Date.now()}` };
  }
};

const rawAuditService = {
  logAction: async (userId: string, action: string, details: any) => {
    if (!userId || !action) throw new Error("UserId and action are required");
    return {
      id: `audit_${Date.now()}`,
      userId,
      action,
      details,
      timestamp: new Date().toISOString()
    };
  }
};

// =============================================================================
// Wrapped Services - No more try-catch needed!
// =============================================================================

const userService = Service.wrapAsync(rawUserService);
const notificationService = Service.withRetry(
  Service.wrapAsync(rawNotificationService),
  3, // max retries
  1000 // delay between retries
);
const auditService = Service.wrapAsync(rawAuditService);

// =============================================================================
// Service Composition Examples
// =============================================================================

// Example 1: Simple chain of operations without try-catch
async function updateUserProfile(userId: string, profileData: any): Promise<Result<any>> {
  const userResult = await userService.findUser(userId);

  const updateResult = await chainAsync(userResult, async (user) => {
    if (!user.active) {
      return ko(new Error("Cannot update inactive user"));
    }
    return await userService.updateUser(userId, profileData);
  });

  const auditResult = await chainAsync(updateResult, async (updatedUser) => {
    return await auditService.logAction(userId, "profile_updated", {
      changes: profileData,
      timestamp: updatedUser.updatedAt
    });
  });

  return map(auditResult, (audit) => ({
    success: true,
    auditId: audit.id,
    message: "Profile updated successfully"
  }));
}

// Example 2: Parallel operations with error handling
async function sendWelcomeNotifications(userId: string): Promise<Result<any>> {
  const userResult = await userService.findUser(userId);

  return await chainAsync(userResult, async (user) => {
    // Send notifications in parallel
    const notificationResults = await parallel([
      () => notificationService.sendEmail(
        user.email,
        "Welcome!",
        `Hello ${user.name}, welcome to our platform!`
      ),
      () => notificationService.sendSMS(
        "+1234567890", // Would normally get from user profile
        `Welcome ${user.name}!`
      )
    ]);

    // Log all notifications (even failed ones)
    const auditPromises = notificationResults.map((result, index) => {
      const channel = index === 0 ? "email" : "sms";
      const success = result.type === "ok";

      return auditService.logAction(userId, "notification_sent", {
        channel,
        success,
        error: result.type === "ko" ? String(result.data) : null
      });
    });

    const auditResults = await Promise.all(auditPromises);
    const combinedAudits = combine(auditResults);

    return map(combinedAudits, (audits) => ({
      emailSent: notificationResults[0].type === "ok",
      smsSent: notificationResults[1].type === "ok",
      auditIds: audits.map(a => a.id),
      summary: `Sent ${notificationResults.filter(r => r.type === "ok").length}/2 notifications`
    }));
  });
}

// Example 3: Complex business logic with multiple services
async function deleteUserAccount(userId: string, reason: string): Promise<Result<any>> {
  // Step 1: Fetch user to validate
  const userResult = await userService.findUser(userId);

  return await chainAsync(userResult, async (user) => {
    // Step 2: Send farewell notifications in parallel
    const notificationResults = await parallel([
      () => notificationService.sendEmail(
        user.email,
        "Account Deletion Confirmation",
        `Your account has been scheduled for deletion. Reason: ${reason}`
      ),
      () => auditService.logAction(userId, "deletion_initiated", { reason })
    ]);

    // Step 3: Delete the user (only if notifications succeeded)
    const emailResult = notificationResults[0];
    const auditResult = notificationResults[1];

    if (emailResult.type === "ko") {
      return ko(new Error("Failed to send confirmation email. Deletion cancelled."));
    }

    if (auditResult.type === "ko") {
      return ko(new Error("Failed to log deletion. Deletion cancelled."));
    }

    // Step 4: Proceed with deletion
    const deletionResult = await userService.deleteUser(userId);

    return await chainAsync(deletionResult, async (deleted) => {
      // Step 5: Final audit log
      const finalAudit = await auditService.logAction(userId, "user_deleted", {
        reason,
        deletedAt: new Date().toISOString(),
        emailSent: emailResult.data.messageId,
        initialAudit: auditResult.data.id
      });

      return map(finalAudit, (audit) => ({
        deleted: true,
        userId,
        reason,
        auditId: audit.id,
        emailConfirmationId: emailResult.data.messageId
      }));
    });
  });
}

// =============================================================================
// Usage Examples
// =============================================================================

async function demonstrateServiceComposition() {
  console.log("=== Service Composition Demo ===\n");

  // Example 1: Update user profile
  console.log("1. Updating user profile...");
  const updateResult = await updateUserProfile("user123", {
    name: "John Smith",
    email: "john.smith@example.com"
  });

  if (updateResult.type === "ok") {
    console.log("✅ Profile updated:", updateResult.data);
  } else {
    console.log("❌ Profile update failed:", updateResult.data);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Example 2: Send welcome notifications
  console.log("2. Sending welcome notifications...");
  const welcomeResult = await sendWelcomeNotifications("user123");

  if (welcomeResult.type === "ok") {
    console.log("✅ Welcome sent:", welcomeResult.data);
  } else {
    console.log("❌ Welcome failed:", welcomeResult.data);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Example 3: Delete user account
  console.log("3. Deleting user account...");
  const deleteResult = await deleteUserAccount("user123", "User requested account deletion");

  if (deleteResult.type === "ok") {
    console.log("✅ Account deleted:", deleteResult.data);
  } else {
    console.log("❌ Deletion failed:", deleteResult.data);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Example 4: Error handling demonstration
  console.log("4. Demonstrating error handling...");

  // Try with invalid user ID
  const invalidResult = await updateUserProfile("", { name: "Test" });
  console.log("Invalid user ID result:", invalidResult.type, invalidResult.data);

  // Try with non-existent user
  const notFoundResult = await updateUserProfile("404", { name: "Test" });
  console.log("User not found result:", notFoundResult.type, notFoundResult.data);

  // Try deleting admin user
  const adminDeleteResult = await deleteUserAccount("admin", "test");
  console.log("Admin delete result:", adminDeleteResult.type, adminDeleteResult.data);
}

// =============================================================================
// Comparison: Before vs After
// =============================================================================

// BEFORE: Traditional try-catch approach
async function updateUserProfileOldWay(userId: string, profileData: any) {
  try {
    const user = await rawUserService.findUser(userId);

    if (!user.active) {
      throw new Error("Cannot update inactive user");
    }

    const updatedUser = await rawUserService.updateUser(userId, profileData);

    try {
      const audit = await rawAuditService.logAction(userId, "profile_updated", {
        changes: profileData,
        timestamp: updatedUser.updatedAt
      });

      return {
        success: true,
        auditId: audit.id,
        message: "Profile updated successfully"
      };
    } catch (auditError) {
      // User was updated but audit failed - what do we do?
      console.error("Audit failed but user was updated:", auditError);
      return {
        success: true,
        auditId: null,
        message: "Profile updated but audit failed",
        warning: auditError.message
      };
    }
  } catch (error) {
    console.error("Update failed:", error);
    throw error; // Re-throw or return error object?
  }
}

// AFTER: Clean Result-based approach - no try-catch needed!
// See updateUserProfile function above

export {
  demonstrateServiceComposition,
  updateUserProfile,
  sendWelcomeNotifications,
  deleteUserAccount,
  userService,
  notificationService,
  auditService
};