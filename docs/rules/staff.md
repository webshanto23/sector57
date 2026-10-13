# Staff and attendance (Step 22)

- Add or change staff only through `StaffService` (`src/staff`); a stint is never deleted, leaving is dated, and coming back is a new row (`rejoin`). A staff member's area is their post (`posted_location_id`) for both `staff` and `attendance`.
- Pay (`monthly_salary` or `daily_rate` by kind) is seen and set only with a society-wide `staff.edit` (`seesPay`).
- A person's details or NID change from staff pages only when the caller may edit them as a member or they are on file only as staff.
- Mark attendance only through `AttendanceService.save` (one row per staff and Dhaka date). Today and yesterday need `attendance.edit`; older days `attendance.approve` (`attendanceOpen` in shared).
- Days worked count half days at a half (`daysWorked`), which payroll (Step 26) will use.
- Tickets, work orders and assets point at a `staff` row, not at a person.
