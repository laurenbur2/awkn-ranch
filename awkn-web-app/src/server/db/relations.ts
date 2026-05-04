import { relations } from "drizzle-orm/relations";
// NOTE: drizzle-kit pull emitted references to `usersInAuth` (the
// supabase-managed `auth.users` table). Pull only introspects `public` by
// default, so usersInAuth isn't actually exported from schema.ts. The
// relation entries that touch it are commented out below — re-add when we
// explicitly model auth.users.
import { wcProviders, wcBookings, wcProviderSchedules, appUsers, jobTitles, todoCategories, todoItems, spaces, bookingRooms, bookingSpaces, staffMembers, activityTypes, activityBookings, memberMemberships, membershipPlans, withinPatients, withinNotes, withinSessions, withinAssessments, withinAppointments, withinConsents, withinInvoices, crmLeads, crmInvoices, crmInvoiceLineItems, crmServicePackages, crmActivities, crmPipelineStages, crmProposals, crmProposalItems, schedulingBookings, schedulingEventTypes, facilitators, clientPackageSessions, schedulingProfiles, services, beds, clientPackages, clientStays, schedulingBookingAttendees, clientIntegrationNotes, eventSpaceReservations, withinRetreatAgreements, crmLeadSources, staffActivityTypes, permissions, rolePermissions, jobTitlePermissions, facilitatorServices, userPermissions, crmServicePackageItems } from "./schema";

export const wcBookingsRelations = relations(wcBookings, ({one}) => ({
	wcProvider: one(wcProviders, {
		fields: [wcBookings.providerId],
		references: [wcProviders.id]
	}),
}));

export const wcProvidersRelations = relations(wcProviders, ({many}) => ({
	wcBookings: many(wcBookings),
	wcProviderSchedules: many(wcProviderSchedules),
}));

export const wcProviderSchedulesRelations = relations(wcProviderSchedules, ({one}) => ({
	wcProvider: one(wcProviders, {
		fields: [wcProviderSchedules.providerId],
		references: [wcProviders.id]
	}),
}));

export const appUsersRelations = relations(appUsers, ({one, many}) => ({
	appUser: one(appUsers, {
		fields: [appUsers.archivedBy],
		references: [appUsers.id],
		relationName: "appUsers_archivedBy_appUsers_id"
	}),
	appUsers: many(appUsers, {
		relationName: "appUsers_archivedBy_appUsers_id"
	}),
	// usersInAuth: one(usersInAuth, {
	// 	fields: [appUsers.authUserId],
	// 	references: [usersInAuth.id]
	// }),
	jobTitle: one(jobTitles, {
		fields: [appUsers.jobTitleId],
		references: [jobTitles.id],
		relationName: "appUsers_jobTitleId_jobTitles_id"
	}),
	bookingRooms: many(bookingRooms),
	bookingSpaces: many(bookingSpaces),
	staffMembers: many(staffMembers),
	activityBookings: many(activityBookings),
	memberMemberships: many(memberMemberships),
	schedulingBookings_createdByAdminId: many(schedulingBookings, {
		relationName: "schedulingBookings_createdByAdminId_appUsers_id"
	}),
	schedulingBookings_staffUserId: many(schedulingBookings, {
		relationName: "schedulingBookings_staffUserId_appUsers_id"
	}),
	schedulingProfiles: many(schedulingProfiles),
	jobTitles: many(jobTitles, {
		relationName: "jobTitles_createdBy_appUsers_id"
	}),
	clientIntegrationNotes: many(clientIntegrationNotes),
	withinRetreatAgreements: many(withinRetreatAgreements),
	crmLeads: many(crmLeads),
	userPermissions_appUserId: many(userPermissions, {
		relationName: "userPermissions_appUserId_appUsers_id"
	}),
	userPermissions_grantedBy: many(userPermissions, {
		relationName: "userPermissions_grantedBy_appUsers_id"
	}),
}));

// export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
// 	appUsers: many(appUsers),
// }));

export const jobTitlesRelations = relations(jobTitles, ({one, many}) => ({
	appUsers: many(appUsers, {
		relationName: "appUsers_jobTitleId_jobTitles_id"
	}),
	appUser: one(appUsers, {
		fields: [jobTitles.createdBy],
		references: [appUsers.id],
		relationName: "jobTitles_createdBy_appUsers_id"
	}),
	jobTitlePermissions: many(jobTitlePermissions),
}));

export const todoItemsRelations = relations(todoItems, ({one}) => ({
	todoCategory: one(todoCategories, {
		fields: [todoItems.categoryId],
		references: [todoCategories.id]
	}),
}));

export const todoCategoriesRelations = relations(todoCategories, ({many}) => ({
	todoItems: many(todoItems),
}));

export const spacesRelations = relations(spaces, ({one, many}) => ({
	space: one(spaces, {
		fields: [spaces.parentId],
		references: [spaces.id],
		relationName: "spaces_parentId_spaces_id"
	}),
	spaces: many(spaces, {
		relationName: "spaces_parentId_spaces_id"
	}),
	bookingRooms: many(bookingRooms),
	bookingSpaces: many(bookingSpaces),
	activityTypes: many(activityTypes),
	activityBookings: many(activityBookings),
	schedulingBookings: many(schedulingBookings),
	beds: many(beds),
	eventSpaceReservations: many(eventSpaceReservations),
	crmLeads: many(crmLeads),
}));

export const bookingRoomsRelations = relations(bookingRooms, ({one}) => ({
	appUser: one(appUsers, {
		fields: [bookingRooms.appUserId],
		references: [appUsers.id]
	}),
	space: one(spaces, {
		fields: [bookingRooms.spaceId],
		references: [spaces.id]
	}),
}));

export const bookingSpacesRelations = relations(bookingSpaces, ({one}) => ({
	appUser: one(appUsers, {
		fields: [bookingSpaces.appUserId],
		references: [appUsers.id]
	}),
	space: one(spaces, {
		fields: [bookingSpaces.spaceId],
		references: [spaces.id]
	}),
}));

export const staffMembersRelations = relations(staffMembers, ({one, many}) => ({
	appUser: one(appUsers, {
		fields: [staffMembers.appUserId],
		references: [appUsers.id]
	}),
	activityBookings: many(activityBookings),
	staffActivityTypes: many(staffActivityTypes),
}));

export const activityTypesRelations = relations(activityTypes, ({one, many}) => ({
	space: one(spaces, {
		fields: [activityTypes.defaultSpaceId],
		references: [spaces.id]
	}),
	activityBookings: many(activityBookings),
	staffActivityTypes: many(staffActivityTypes),
}));

export const activityBookingsRelations = relations(activityBookings, ({one}) => ({
	activityType: one(activityTypes, {
		fields: [activityBookings.activityTypeId],
		references: [activityTypes.id]
	}),
	appUser: one(appUsers, {
		fields: [activityBookings.appUserId],
		references: [appUsers.id]
	}),
	space: one(spaces, {
		fields: [activityBookings.spaceId],
		references: [spaces.id]
	}),
	staffMember: one(staffMembers, {
		fields: [activityBookings.staffMemberId],
		references: [staffMembers.id]
	}),
}));

export const memberMembershipsRelations = relations(memberMemberships, ({one}) => ({
	appUser: one(appUsers, {
		fields: [memberMemberships.appUserId],
		references: [appUsers.id]
	}),
	membershipPlan: one(membershipPlans, {
		fields: [memberMemberships.planId],
		references: [membershipPlans.id]
	}),
}));

export const membershipPlansRelations = relations(membershipPlans, ({many}) => ({
	memberMemberships: many(memberMemberships),
}));

export const withinNotesRelations = relations(withinNotes, ({one}) => ({
	withinPatient: one(withinPatients, {
		fields: [withinNotes.patientId],
		references: [withinPatients.id]
	}),
}));

export const withinPatientsRelations = relations(withinPatients, ({many}) => ({
	withinNotes: many(withinNotes),
	withinSessions: many(withinSessions),
	withinAssessments: many(withinAssessments),
	withinAppointments: many(withinAppointments),
	withinConsents: many(withinConsents),
	withinInvoices: many(withinInvoices),
}));

export const withinSessionsRelations = relations(withinSessions, ({one}) => ({
	withinPatient: one(withinPatients, {
		fields: [withinSessions.patientId],
		references: [withinPatients.id]
	}),
}));

export const withinAssessmentsRelations = relations(withinAssessments, ({one}) => ({
	withinPatient: one(withinPatients, {
		fields: [withinAssessments.patientId],
		references: [withinPatients.id]
	}),
}));

export const withinAppointmentsRelations = relations(withinAppointments, ({one}) => ({
	withinPatient: one(withinPatients, {
		fields: [withinAppointments.patientId],
		references: [withinPatients.id]
	}),
}));

export const withinConsentsRelations = relations(withinConsents, ({one}) => ({
	withinPatient: one(withinPatients, {
		fields: [withinConsents.patientId],
		references: [withinPatients.id]
	}),
}));

export const withinInvoicesRelations = relations(withinInvoices, ({one}) => ({
	withinPatient: one(withinPatients, {
		fields: [withinInvoices.patientId],
		references: [withinPatients.id]
	}),
}));

export const crmInvoicesRelations = relations(crmInvoices, ({one, many}) => ({
	crmLead: one(crmLeads, {
		fields: [crmInvoices.leadId],
		references: [crmLeads.id]
	}),
	crmInvoiceLineItems: many(crmInvoiceLineItems),
}));

export const crmLeadsRelations = relations(crmLeads, ({one, many}) => ({
	crmInvoices: many(crmInvoices),
	crmActivities: many(crmActivities),
	crmProposals: many(crmProposals),
	schedulingBookings: many(schedulingBookings),
	clientPackages: many(clientPackages),
	clientStays: many(clientStays),
	schedulingBookingAttendees: many(schedulingBookingAttendees),
	clientIntegrationNotes: many(clientIntegrationNotes),
	eventSpaceReservations: many(eventSpaceReservations),
	withinRetreatAgreements: many(withinRetreatAgreements),
	appUser: one(appUsers, {
		fields: [crmLeads.assignedTo],
		references: [appUsers.id]
	}),
	crmLeadSource: one(crmLeadSources, {
		fields: [crmLeads.sourceId],
		references: [crmLeadSources.id]
	}),
	space: one(spaces, {
		fields: [crmLeads.spaceId],
		references: [spaces.id]
	}),
	crmPipelineStage: one(crmPipelineStages, {
		fields: [crmLeads.stageId],
		references: [crmPipelineStages.id]
	}),
}));

export const crmInvoiceLineItemsRelations = relations(crmInvoiceLineItems, ({one}) => ({
	crmInvoice: one(crmInvoices, {
		fields: [crmInvoiceLineItems.invoiceId],
		references: [crmInvoices.id]
	}),
	crmServicePackage: one(crmServicePackages, {
		fields: [crmInvoiceLineItems.servicePackageId],
		references: [crmServicePackages.id]
	}),
}));

export const crmServicePackagesRelations = relations(crmServicePackages, ({many}) => ({
	crmInvoiceLineItems: many(crmInvoiceLineItems),
	crmServicePackageItems: many(crmServicePackageItems),
}));

export const crmActivitiesRelations = relations(crmActivities, ({one}) => ({
	crmLead: one(crmLeads, {
		fields: [crmActivities.leadId],
		references: [crmLeads.id]
	}),
	crmPipelineStage_newStageId: one(crmPipelineStages, {
		fields: [crmActivities.newStageId],
		references: [crmPipelineStages.id],
		relationName: "crmActivities_newStageId_crmPipelineStages_id"
	}),
	crmPipelineStage_oldStageId: one(crmPipelineStages, {
		fields: [crmActivities.oldStageId],
		references: [crmPipelineStages.id],
		relationName: "crmActivities_oldStageId_crmPipelineStages_id"
	}),
}));

export const crmPipelineStagesRelations = relations(crmPipelineStages, ({many}) => ({
	crmActivities_newStageId: many(crmActivities, {
		relationName: "crmActivities_newStageId_crmPipelineStages_id"
	}),
	crmActivities_oldStageId: many(crmActivities, {
		relationName: "crmActivities_oldStageId_crmPipelineStages_id"
	}),
	crmLeads: many(crmLeads),
}));

export const crmProposalItemsRelations = relations(crmProposalItems, ({one}) => ({
	crmProposal: one(crmProposals, {
		fields: [crmProposalItems.proposalId],
		references: [crmProposals.id]
	}),
}));

export const crmProposalsRelations = relations(crmProposals, ({one, many}) => ({
	crmProposalItems: many(crmProposalItems),
	crmLead: one(crmLeads, {
		fields: [crmProposals.leadId],
		references: [crmLeads.id]
	}),
}));

export const schedulingBookingsRelations = relations(schedulingBookings, ({one, many}) => ({
	appUser_createdByAdminId: one(appUsers, {
		fields: [schedulingBookings.createdByAdminId],
		references: [appUsers.id],
		relationName: "schedulingBookings_createdByAdminId_appUsers_id"
	}),
	schedulingEventType: one(schedulingEventTypes, {
		fields: [schedulingBookings.eventTypeId],
		references: [schedulingEventTypes.id]
	}),
	facilitator: one(facilitators, {
		fields: [schedulingBookings.facilitatorId],
		references: [facilitators.id]
	}),
	crmLead: one(crmLeads, {
		fields: [schedulingBookings.leadId],
		references: [crmLeads.id]
	}),
	clientPackageSession: one(clientPackageSessions, {
		fields: [schedulingBookings.packageSessionId],
		references: [clientPackageSessions.id],
		relationName: "schedulingBookings_packageSessionId_clientPackageSessions_id"
	}),
	schedulingProfile: one(schedulingProfiles, {
		fields: [schedulingBookings.profileId],
		references: [schedulingProfiles.id]
	}),
	schedulingBooking: one(schedulingBookings, {
		fields: [schedulingBookings.rescheduledFrom],
		references: [schedulingBookings.id],
		relationName: "schedulingBookings_rescheduledFrom_schedulingBookings_id"
	}),
	schedulingBookings: many(schedulingBookings, {
		relationName: "schedulingBookings_rescheduledFrom_schedulingBookings_id"
	}),
	service: one(services, {
		fields: [schedulingBookings.serviceId],
		references: [services.id]
	}),
	space: one(spaces, {
		fields: [schedulingBookings.spaceId],
		references: [spaces.id]
	}),
	appUser_staffUserId: one(appUsers, {
		fields: [schedulingBookings.staffUserId],
		references: [appUsers.id],
		relationName: "schedulingBookings_staffUserId_appUsers_id"
	}),
	clientPackageSessions: many(clientPackageSessions, {
		relationName: "clientPackageSessions_bookingId_schedulingBookings_id"
	}),
	schedulingBookingAttendees: many(schedulingBookingAttendees),
}));

export const schedulingEventTypesRelations = relations(schedulingEventTypes, ({one, many}) => ({
	schedulingBookings: many(schedulingBookings),
	schedulingProfile: one(schedulingProfiles, {
		fields: [schedulingEventTypes.profileId],
		references: [schedulingProfiles.id]
	}),
}));

export const facilitatorsRelations = relations(facilitators, ({many}) => ({
	schedulingBookings: many(schedulingBookings),
	facilitatorServices: many(facilitatorServices),
}));

export const clientPackageSessionsRelations = relations(clientPackageSessions, ({one, many}) => ({
	schedulingBookings: many(schedulingBookings, {
		relationName: "schedulingBookings_packageSessionId_clientPackageSessions_id"
	}),
	schedulingBooking: one(schedulingBookings, {
		fields: [clientPackageSessions.bookingId],
		references: [schedulingBookings.id],
		relationName: "clientPackageSessions_bookingId_schedulingBookings_id"
	}),
	clientPackage: one(clientPackages, {
		fields: [clientPackageSessions.packageId],
		references: [clientPackages.id]
	}),
	service: one(services, {
		fields: [clientPackageSessions.serviceId],
		references: [services.id]
	}),
	schedulingBookingAttendees: many(schedulingBookingAttendees),
}));

export const schedulingProfilesRelations = relations(schedulingProfiles, ({one, many}) => ({
	schedulingBookings: many(schedulingBookings),
	appUser: one(appUsers, {
		fields: [schedulingProfiles.appUserId],
		references: [appUsers.id]
	}),
	schedulingEventTypes: many(schedulingEventTypes),
}));

export const servicesRelations = relations(services, ({many}) => ({
	schedulingBookings: many(schedulingBookings),
	clientPackageSessions: many(clientPackageSessions),
	facilitatorServices: many(facilitatorServices),
	crmServicePackageItems: many(crmServicePackageItems),
}));

export const bedsRelations = relations(beds, ({one, many}) => ({
	space: one(spaces, {
		fields: [beds.spaceId],
		references: [spaces.id]
	}),
	clientStays: many(clientStays),
}));

export const clientPackagesRelations = relations(clientPackages, ({one, many}) => ({
	crmLead: one(crmLeads, {
		fields: [clientPackages.leadId],
		references: [crmLeads.id]
	}),
	clientPackageSessions: many(clientPackageSessions),
	clientStays: many(clientStays),
	withinRetreatAgreements: many(withinRetreatAgreements),
}));

export const clientStaysRelations = relations(clientStays, ({one}) => ({
	bed: one(beds, {
		fields: [clientStays.bedId],
		references: [beds.id]
	}),
	crmLead: one(crmLeads, {
		fields: [clientStays.leadId],
		references: [crmLeads.id]
	}),
	clientPackage: one(clientPackages, {
		fields: [clientStays.packageId],
		references: [clientPackages.id]
	}),
}));

export const schedulingBookingAttendeesRelations = relations(schedulingBookingAttendees, ({one}) => ({
	schedulingBooking: one(schedulingBookings, {
		fields: [schedulingBookingAttendees.bookingId],
		references: [schedulingBookings.id]
	}),
	crmLead: one(crmLeads, {
		fields: [schedulingBookingAttendees.leadId],
		references: [crmLeads.id]
	}),
	clientPackageSession: one(clientPackageSessions, {
		fields: [schedulingBookingAttendees.packageSessionId],
		references: [clientPackageSessions.id]
	}),
}));

export const clientIntegrationNotesRelations = relations(clientIntegrationNotes, ({one}) => ({
	appUser: one(appUsers, {
		fields: [clientIntegrationNotes.authorAppUserId],
		references: [appUsers.id]
	}),
	crmLead: one(crmLeads, {
		fields: [clientIntegrationNotes.leadId],
		references: [crmLeads.id]
	}),
}));

export const eventSpaceReservationsRelations = relations(eventSpaceReservations, ({one}) => ({
	crmLead: one(crmLeads, {
		fields: [eventSpaceReservations.leadId],
		references: [crmLeads.id]
	}),
	space: one(spaces, {
		fields: [eventSpaceReservations.spaceId],
		references: [spaces.id]
	}),
}));

export const withinRetreatAgreementsRelations = relations(withinRetreatAgreements, ({one}) => ({
	appUser: one(appUsers, {
		fields: [withinRetreatAgreements.createdBy],
		references: [appUsers.id]
	}),
	crmLead: one(crmLeads, {
		fields: [withinRetreatAgreements.leadId],
		references: [crmLeads.id]
	}),
	clientPackage: one(clientPackages, {
		fields: [withinRetreatAgreements.packageId],
		references: [clientPackages.id]
	}),
}));

export const crmLeadSourcesRelations = relations(crmLeadSources, ({many}) => ({
	crmLeads: many(crmLeads),
}));

export const staffActivityTypesRelations = relations(staffActivityTypes, ({one}) => ({
	activityType: one(activityTypes, {
		fields: [staffActivityTypes.activityTypeId],
		references: [activityTypes.id]
	}),
	staffMember: one(staffMembers, {
		fields: [staffActivityTypes.staffMemberId],
		references: [staffMembers.id]
	}),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({one}) => ({
	permission: one(permissions, {
		fields: [rolePermissions.permissionKey],
		references: [permissions.key]
	}),
}));

export const permissionsRelations = relations(permissions, ({many}) => ({
	rolePermissions: many(rolePermissions),
	jobTitlePermissions: many(jobTitlePermissions),
	userPermissions: many(userPermissions),
}));

export const jobTitlePermissionsRelations = relations(jobTitlePermissions, ({one}) => ({
	jobTitle: one(jobTitles, {
		fields: [jobTitlePermissions.jobTitleId],
		references: [jobTitles.id]
	}),
	permission: one(permissions, {
		fields: [jobTitlePermissions.permissionKey],
		references: [permissions.key]
	}),
}));

export const facilitatorServicesRelations = relations(facilitatorServices, ({one}) => ({
	facilitator: one(facilitators, {
		fields: [facilitatorServices.facilitatorId],
		references: [facilitators.id]
	}),
	service: one(services, {
		fields: [facilitatorServices.serviceId],
		references: [services.id]
	}),
}));

export const userPermissionsRelations = relations(userPermissions, ({one}) => ({
	appUser_appUserId: one(appUsers, {
		fields: [userPermissions.appUserId],
		references: [appUsers.id],
		relationName: "userPermissions_appUserId_appUsers_id"
	}),
	appUser_grantedBy: one(appUsers, {
		fields: [userPermissions.grantedBy],
		references: [appUsers.id],
		relationName: "userPermissions_grantedBy_appUsers_id"
	}),
	permission: one(permissions, {
		fields: [userPermissions.permissionKey],
		references: [permissions.key]
	}),
}));

export const crmServicePackageItemsRelations = relations(crmServicePackageItems, ({one}) => ({
	crmServicePackage: one(crmServicePackages, {
		fields: [crmServicePackageItems.packageId],
		references: [crmServicePackages.id]
	}),
	service: one(services, {
		fields: [crmServicePackageItems.serviceId],
		references: [services.id]
	}),
}));