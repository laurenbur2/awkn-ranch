/**
 * Booking Service - Data access layer for the reservation/booking system
 *
 * Handles:
 * - Room bookings (nightly stays)
 * - Space bookings (hourly/daily/overnight rentals)
 * - Activity bookings (wellness services)
 * - Staff members & activity types (reference data)
 * - Conflict detection across all booking types
 */

import { supabase } from './supabase.js';
import { AUSTIN_TIMEZONE } from './timezone.js';

// =============================================
// STATUS CONSTANTS
// =============================================

export const ROOM_STATUS = {
  HOLD: 'hold',
  CONFIRMED: 'confirmed',
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
};

export const SPACE_STATUS = {
  HOLD: 'hold',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const ACTIVITY_STATUS = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
};

export const BOOKING_TYPE = {
  HOURLY: 'hourly',
  FULL_DAY: 'full_day',
  OVERNIGHT: 'overnight',
};

// =============================================
// COLOR MAPS
// =============================================

export const ROOM_STATUS_COLORS = {
  hold: '#9CA3AF',
  confirmed: '#d4883a',
  checked_in: '#2d8a4e',
  checked_out: '#6B7280',
  cancelled: '#c53030',
  no_show: '#7C3AED',
};

export const SPACE_STATUS_COLORS = {
  hold: '#9CA3AF',
  confirmed: '#2563EB',
  in_progress: '#2d8a4e',
  completed: '#6B7280',
  cancelled: '#c53030',
};

// =============================================
// SPACES (Reference Data)
// =============================================

export async function getBookableSpaces(category) {
  let query = supabase
    .from('spaces')
    .select('*')
    .not('booking_category', 'is', null)
    .eq('is_archived', false)
    .order('booking_display_order');

  if (category) {
    query = query.eq('booking_category', category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// =============================================
// ROOM BOOKINGS (Nightly Stays)
// =============================================

export async function getRoomBookings(startDate, endDate) {
  const { data, error } = await supabase
    .from('booking_rooms')
    .select('*, space:space_id(id, name, booking_name, nightly_rate, booking_display_order)')
    .gte('check_out', startDate)
    .lte('check_in', endDate)
    .neq('status', 'cancelled')
    .order('check_in');

  if (error) throw error;
  return data || [];
}

export async function createRoomBooking(booking) {
  const nights = Math.ceil((new Date(booking.check_out) - new Date(booking.check_in)) / (1000 * 60 * 60 * 24));
  const total = nights * booking.nightly_rate;

  const { data, error } = await supabase
    .from('booking_rooms')
    .insert({
      space_id: booking.space_id,
      app_user_id: booking.app_user_id || null,
      guest_name: booking.guest_name,
      guest_email: booking.guest_email || null,
      guest_phone: booking.guest_phone || null,
      check_in: booking.check_in,
      check_out: booking.check_out,
      nightly_rate: booking.nightly_rate,
      total_amount: total,
      status: booking.status || 'confirmed',
      source: booking.source || 'direct',
      notes: booking.notes || null,
      created_by: booking.created_by || null,
    })
    .select('*, space:space_id(id, name, booking_name)')
    .single();

  if (error) throw error;
  return data;
}

export async function updateRoomBooking(id, updates) {
  if (updates.check_in && updates.check_out && updates.nightly_rate) {
    const nights = Math.ceil((new Date(updates.check_out) - new Date(updates.check_in)) / (1000 * 60 * 60 * 24));
    updates.total_amount = nights * updates.nightly_rate;
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('booking_rooms')
    .update(updates)
    .eq('id', id)
    .select('*, space:space_id(id, name, booking_name)')
    .single();

  if (error) throw error;
  return data;
}

export async function cancelRoomBooking(id) {
  return updateRoomBooking(id, { status: 'cancelled' });
}

// =============================================
// SPACE BOOKINGS (Hourly/Daily/Overnight)
// =============================================

export async function getSpaceBookings(startDatetime, endDatetime) {
  const { data, error } = await supabase
    .from('booking_spaces')
    .select('*, space:space_id(id, name, booking_name, booking_category, hourly_rate, overnight_rate, full_day_rate, cleaning_fee)')
    .gte('end_datetime', startDatetime)
    .lte('start_datetime', endDatetime)
    .neq('status', 'cancelled')
    .order('start_datetime');

  if (error) throw error;
  return data || [];
}

export async function createSpaceBooking(booking) {
  const { data, error } = await supabase
    .from('booking_spaces')
    .insert({
      space_id: booking.space_id,
      app_user_id: booking.app_user_id || null,
      client_name: booking.client_name,
      client_email: booking.client_email || null,
      client_phone: booking.client_phone || null,
      booking_type: booking.booking_type,
      start_datetime: booking.start_datetime,
      end_datetime: booking.end_datetime,
      hourly_rate: booking.hourly_rate || null,
      flat_rate: booking.flat_rate || null,
      cleaning_fee: booking.cleaning_fee || 0,
      total_amount: booking.total_amount,
      status: booking.status || 'confirmed',
      notes: booking.notes || null,
      created_by: booking.created_by || null,
    })
    .select('*, space:space_id(id, name, booking_name)')
    .single();

  if (error) throw error;
  return data;
}

export async function updateSpaceBooking(id, updates) {
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('booking_spaces')
    .update(updates)
    .eq('id', id)
    .select('*, space:space_id(id, name, booking_name)')
    .single();

  if (error) throw error;
  return data;
}

export async function cancelSpaceBooking(id) {
  return updateSpaceBooking(id, { status: 'cancelled' });
}

// =============================================
// ACTIVITY BOOKINGS
// =============================================

export async function getActivityBookings(startDatetime, endDatetime) {
  const { data, error } = await supabase
    .from('activity_bookings')
    .select(`
      *,
      activity_type:activity_type_id(id, name, color, default_duration_min, buffer_min),
      staff:staff_member_id(id, display_name, color),
      space:space_id(id, name, booking_name)
    `)
    .gte('buffer_end', startDatetime)
    .lte('start_datetime', endDatetime)
    .neq('status', 'cancelled')
    .order('start_datetime');

  if (error) throw error;
  return data || [];
}

export async function createActivityBooking(booking) {
  const { data, error } = await supabase
    .from('activity_bookings')
    .insert({
      activity_type_id: booking.activity_type_id,
      staff_member_id: booking.staff_member_id,
      space_id: booking.space_id,
      app_user_id: booking.app_user_id || null,
      client_name: booking.client_name || null,
      start_datetime: booking.start_datetime,
      end_datetime: booking.end_datetime,
      buffer_end: booking.buffer_end,
      price: booking.price || null,
      status: booking.status || 'scheduled',
      notes: booking.notes || null,
      created_by: booking.created_by || null,
    })
    .select(`
      *,
      activity_type:activity_type_id(id, name, color, default_duration_min, buffer_min),
      staff:staff_member_id(id, display_name, color),
      space:space_id(id, name, booking_name)
    `)
    .single();

  if (error) throw error;
  return data;
}

export async function updateActivityBooking(id, updates) {
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('activity_bookings')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      activity_type:activity_type_id(id, name, color),
      staff:staff_member_id(id, display_name, color),
      space:space_id(id, name, booking_name)
    `)
    .single();

  if (error) throw error;
  return data;
}

export async function cancelActivityBooking(id) {
  return updateActivityBooking(id, { status: 'cancelled' });
}

// =============================================
// STAFF MEMBERS
// =============================================

export async function getStaffMembers() {
  const { data, error } = await supabase
    .from('staff_members')
    .select('*')
    .eq('is_active', true)
    .order('display_name');

  if (error) throw error;
  return data || [];
}

export async function getStaffWithActivities() {
  const { data, error } = await supabase
    .from('staff_members')
    .select('*, staff_activity_types(activity_type_id)')
    .eq('is_active', true)
    .order('display_name');

  if (error) throw error;
  return data || [];
}

// =============================================
// ACTIVITY TYPES
// =============================================

export async function getActivityTypes() {
  const { data, error } = await supabase
    .from('activity_types')
    .select('*')
    .eq('is_active', true)
    .order('display_order');

  if (error) throw error;
  return data || [];
}

// =============================================
// CONFLICT DETECTION
// =============================================

/**
 * Check if a space has any conflicting bookings across ALL booking tables
 * for a given time range. Returns array of conflicts.
 */
export async function checkSpaceConflicts(spaceId, startDatetime, endDatetime, excludeId = null) {
  const conflicts = [];

  // Check room bookings (date-based)
  const startDate = startDatetime.split('T')[0];
  const endDate = endDatetime.split('T')[0];

  let roomQuery = supabase
    .from('booking_rooms')
    .select('id, guest_name, check_in, check_out, status')
    .eq('space_id', spaceId)
    .neq('status', 'cancelled')
    .lt('check_in', endDate)
    .gt('check_out', startDate);

  if (excludeId) roomQuery = roomQuery.neq('id', excludeId);
  const { data: roomConflicts } = await roomQuery;
  if (roomConflicts?.length) {
    conflicts.push(...roomConflicts.map(r => ({ type: 'room', ...r })));
  }

  // Check space bookings (datetime-based)
  let spaceQuery = supabase
    .from('booking_spaces')
    .select('id, client_name, start_datetime, end_datetime, status')
    .eq('space_id', spaceId)
    .neq('status', 'cancelled')
    .lt('start_datetime', endDatetime)
    .gt('end_datetime', startDatetime);

  if (excludeId) spaceQuery = spaceQuery.neq('id', excludeId);
  const { data: spaceConflicts } = await spaceQuery;
  if (spaceConflicts?.length) {
    conflicts.push(...spaceConflicts.map(s => ({ type: 'space', ...s })));
  }

  // Check activity bookings (including buffer time)
  let activityQuery = supabase
    .from('activity_bookings')
    .select('id, client_name, start_datetime, buffer_end, status')
    .eq('space_id', spaceId)
    .neq('status', 'cancelled')
    .lt('start_datetime', endDatetime)
    .gt('buffer_end', startDatetime);

  if (excludeId) activityQuery = activityQuery.neq('id', excludeId);
  const { data: activityConflicts } = await activityQuery;
  if (activityConflicts?.length) {
    conflicts.push(...activityConflicts.map(a => ({ type: 'activity', ...a })));
  }

  return conflicts;
}

/**
 * Check if a staff member has conflicting activity bookings for a given time range
 */
export async function checkStaffConflicts(staffMemberId, startDatetime, endDatetime, excludeId = null) {
  let query = supabase
    .from('activity_bookings')
    .select('id, client_name, start_datetime, buffer_end, status, activity_type:activity_type_id(name)')
    .eq('staff_member_id', staffMemberId)
    .neq('status', 'cancelled')
    .lt('start_datetime', endDatetime)
    .gt('buffer_end', startDatetime);

  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// =============================================
// RATE CALCULATIONS
// =============================================

export function calculateRoomTotal(nightlyRate, checkIn, checkOut) {
  const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
  return { nights, total: nights * nightlyRate };
}

export function calculateSpaceTotal(space, bookingType, startDatetime, endDatetime) {
  let total = 0;
  let cleaningFee = parseFloat(space.cleaning_fee) || 0;

  if (bookingType === 'hourly') {
    const hours = (new Date(endDatetime) - new Date(startDatetime)) / (1000 * 60 * 60);
    total = hours * parseFloat(space.hourly_rate);
  } else if (bookingType === 'full_day') {
    total = parseFloat(space.full_day_rate);
  } else if (bookingType === 'overnight') {
    total = parseFloat(space.overnight_rate);
  }

  return { subtotal: total, cleaningFee, total: total + cleaningFee };
}

// =============================================
// STATS
// =============================================

export async function getTodayStats() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: AUSTIN_TIMEZONE });
  const todayStart = `${today}T00:00:00`;
  const todayEnd = `${today}T23:59:59`;

  const [rooms, spaces, activities] = await Promise.all([
    supabase
      .from('booking_rooms')
      .select('id', { count: 'exact' })
      .lte('check_in', today)
      .gte('check_out', today)
      .in('status', ['confirmed', 'checked_in']),
    supabase
      .from('booking_spaces')
      .select('id', { count: 'exact' })
      .lte('start_datetime', todayEnd)
      .gte('end_datetime', todayStart)
      .in('status', ['confirmed', 'in_progress']),
    supabase
      .from('activity_bookings')
      .select('id', { count: 'exact' })
      .gte('start_datetime', todayStart)
      .lte('start_datetime', todayEnd)
      .in('status', ['scheduled', 'in_progress']),
  ]);

  return {
    occupiedRooms: rooms.count || 0,
    activeSpaceRentals: spaces.count || 0,
    scheduledActivities: activities.count || 0,
  };
}

// =============================================
// EXPORT
// =============================================

export const bookingService = {
  // Spaces
  getBookableSpaces,
  // Room bookings
  getRoomBookings,
  createRoomBooking,
  updateRoomBooking,
  cancelRoomBooking,
  // Space bookings
  getSpaceBookings,
  createSpaceBooking,
  updateSpaceBooking,
  cancelSpaceBooking,
  // Activity bookings
  getActivityBookings,
  createActivityBooking,
  updateActivityBooking,
  cancelActivityBooking,
  // Reference data
  getStaffMembers,
  getStaffWithActivities,
  getActivityTypes,
  // Conflicts
  checkSpaceConflicts,
  checkStaffConflicts,
  // Calculations
  calculateRoomTotal,
  calculateSpaceTotal,
  // Stats
  getTodayStats,
  // Constants
  ROOM_STATUS,
  SPACE_STATUS,
  ACTIVITY_STATUS,
  BOOKING_TYPE,
  ROOM_STATUS_COLORS,
  SPACE_STATUS_COLORS,
};
