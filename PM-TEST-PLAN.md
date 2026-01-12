# SIJ Production Scheduler - PM Test Plan

This document outlines testable scenarios for each phase of the SIJ Production Scheduler. For each phase, you'll find what you should be able to do, step-by-step verification instructions, and expected behaviors.

---

## Phase 1: Single Item Schedule

### What You Should Be Able To Do
- View a list of available products
- Create an order for a single product with quantity and due date
- Generate a weekly production schedule for that order
- View the schedule broken down by day and production step
- Log actual production work (start time, end time, quantity completed)
- Compare actual vs planned performance with efficiency metrics

### Test Scenarios

#### 1.1 View Products
**Steps:**
1. Open the app (web or mobile)
2. Navigate to the Products section

**Expected Behavior:**
- A list of products appears (should include Tenjam products from the seeded data)
- Each product displays its name
- Tapping/clicking a product shows its production steps with:
  - Step name
  - Category (CUTTING, SILKSCREEN, PREP, SEWING, INSPECTION)
  - Time per piece
  - Step dependencies (which steps must complete first)

#### 1.2 Create an Order
**Steps:**
1. Navigate to "Create Order" or tap a "+" button
2. Select a product from the dropdown/list
3. Enter a quantity (e.g., 100 units)
4. Select a due date (e.g., 2 weeks from today)
5. Submit the order

**Expected Behavior:**
- Order confirmation appears showing:
  - Product name
  - Quantity
  - Due date
- Order appears in an orders list
- Order status shows as "Pending" or "Unscheduled"

#### 1.3 Generate a Schedule
**Steps:**
1. Navigate to an unscheduled order
2. Tap/click "Generate Schedule"
3. Wait for schedule generation to complete

**Expected Behavior:**
- Loading indicator appears during generation
- Schedule is created and displayed
- Schedule shows the week starting from order creation
- Steps are distributed across workdays respecting:
  - Dependencies (cutting before sewing, etc.)
  - 8-hour workday (7:00-11:00, 11:30-15:30 with lunch break)

#### 1.4 View Schedule Details
**Steps:**
1. After generating a schedule, view the week calendar
2. Tap on a specific day to see details

**Expected Behavior:**
- Week view shows which steps are planned for each day
- Daily detail view shows:
  - Each step scheduled for that day
  - Start time and end time
  - Planned output quantity
- Steps on later days don't conflict with dependencies on earlier days

#### 1.5 Log Production - Start Work
**Steps:**
1. View the schedule and tap on a scheduled task
2. In the Production Log sheet that appears, tap "Start Work"

**Expected Behavior:**
- Bottom sheet opens showing task details:
  - Step name and category badge
  - Status indicator (Not Started → In Progress)
  - Scheduled start/end times and planned output
- After tapping "Start Work":
  - Actual start time is recorded (current time)
  - Status changes to "In Progress"
  - "Start Work" button is replaced with "Update" and "Complete" buttons

#### 1.6 Log Production - Complete Work
**Steps:**
1. Open a task that is "In Progress"
2. Enter the actual output quantity (number of pieces completed)
3. Tap "Complete"

**Expected Behavior:**
- Number input allows entering actual output
- Shows helper text with planned output for reference
- After tapping "Complete":
  - Actual end time is recorded (current time)
  - Status changes to "Completed"
  - Performance stats are displayed:
    - Efficiency % (100% = met standard, >100% = exceeded)
    - Actual pieces per hour
    - Variance vs planned (+/- pieces)
- Progress bar on schedule calendar updates to show completion

#### 1.7 Log Production - Update In-Progress Work
**Steps:**
1. Open a task that is "In Progress"
2. Adjust the actual output number
3. Tap "Update"

**Expected Behavior:**
- Can update output count while work is ongoing
- Progress is saved without completing the task
- Schedule view reflects updated progress percentage

#### 1.8 View Production Performance
**Steps:**
1. Complete a task with actual times and output logged
2. Re-open the completed task from the schedule

**Expected Behavior:**
- Shows both scheduled and actual times side by side
- Performance section displays:
  - Efficiency percentage (actual time vs standard time)
  - Actual pieces per hour rate
  - Variance: positive (green) if ahead, negative (red) if behind
- Input fields are disabled for completed tasks

---

## Phase 2: Worker Skills & Equipment

### What You Should Be Able To Do
- View a list of workers
- View and edit worker skill proficiency levels (1-5) for each production step
- See which workers are assigned to schedule entries
- Manually reassign workers to different steps

### Test Scenarios

#### 2.1 View Workers
**Steps:**
1. Navigate to the Workers section
2. Select a worker from the list

**Expected Behavior:**
- List shows workers A through H (from spreadsheet data)
- Worker detail shows their skill proficiencies per step
- Skills are categorized (SEWING vs OTHER)

#### 2.2 Edit Worker Proficiency
**Steps:**
1. Select a worker
2. Find a specific production step skill
3. Adjust the proficiency slider from current level to a new level (1-5)
4. Save changes

**Expected Behavior:**
- Slider moves smoothly between levels 1-5
- Saving shows confirmation
- Returning to the worker shows the updated proficiency level
- Level meanings are clear:
  - 1 = Beginner (slower output)
  - 3 = Standard (baseline output)
  - 5 = Expert (faster output)

#### 2.3 View Worker Assignments in Schedule
**Steps:**
1. Generate a new schedule (or view an existing one)
2. Navigate to the schedule view

**Expected Behavior:**
- Each schedule entry shows the assigned worker
- Workers are assigned based on:
  - Skill category match (SEWING workers to sewing steps)
  - Higher proficiency workers prioritized
- Multiple workers can be assigned to the same step (parallel work)

#### 2.4 Manually Reassign Worker
**Steps:**
1. View a schedule entry
2. Tap/click on the entry to edit
3. View available workers for this step
4. Select a different worker
5. Confirm the change

**Expected Behavior:**
- Available workers list only shows workers qualified for this step type
- Each worker shows their proficiency level for this step
- After reassignment, schedule entry updates to show new worker
- If the new worker is slower (lower proficiency), warning may appear about timeline impact

---

## Phase 3: Multiple Items in One Week

### What You Should Be Able To Do
- Create multiple orders for different products
- Generate a combined schedule for multiple orders in the same week
- Distinguish between orders in the schedule view
- Filter the schedule by specific order

### Test Scenarios

#### 3.1 Create Multiple Orders
**Steps:**
1. Create Order A: Product X, 50 units, due in 2 weeks
2. Create Order B: Product Y, 75 units, due in 10 days
3. Create Order C: Product X, 30 units, due in 2 weeks

**Expected Behavior:**
- All three orders appear in the orders list
- Each order shows its product, quantity, and due date
- Orders can be selected for scheduling

#### 3.2 Generate Combined Schedule
**Steps:**
1. Select all three orders (multi-select)
2. Tap "Generate Combined Schedule"

**Expected Behavior:**
- Single schedule is generated covering all orders
- Order B (earlier due date) has its steps prioritized
- Workers are balanced across orders (not all on one order)
- No resource conflicts (worker isn't double-booked)

#### 3.3 View Schedule with Color Coding
**Steps:**
1. View the generated combined schedule
2. Look at a day with multiple orders' steps

**Expected Behavior:**
- Each order has a distinct color
- Schedule entries show their color
- Legend or key indicates which color = which order
- Easy to visually distinguish Order A steps from Order B steps

#### 3.4 Filter Schedule by Order
**Steps:**
1. Open the schedule filter options
2. Select "Order B only"
3. View the filtered schedule

**Expected Behavior:**
- Only Order B's schedule entries are visible
- Other orders' entries are hidden
- Filter indicator shows which filter is active
- Clearing filter shows all orders again

---

## Phase 4: Skill Updates from Productivity History

> **Note:** Basic production logging (start/end times, actual output) is available in Phase 1. Phase 4 builds on this data to provide worker-level analytics and automatic proficiency adjustments.

### What You Should Be Able To Do
- View aggregated productivity statistics per worker (from Phase 1 logged data)
- See proficiency levels automatically adjust based on performance
- View proficiency trends over time

### Test Scenarios

#### 4.1 View Worker Productivity Stats
**Steps:**
1. Navigate to Worker C's profile
2. Open the Productivity section

**Expected Behavior:**
- Shows productivity history per step
- Displays metrics:
  - Average output rate
  - Comparison to expected rate
  - Total units produced
  - Total hours worked
- Recent sessions listed with date, step, and output

#### 4.2 Observe Automatic Proficiency Adjustment
**Steps:**
1. Ensure Worker C has completed several schedule entries for the same step type (from Phase 1 logging) where they consistently exceed expected output by 20%+
2. Wait or trigger proficiency recalculation
3. Check Worker C's proficiency for that step

**Expected Behavior:**
- Proficiency level increases (e.g., from 3 to 4)
- Notification or indicator shows "Proficiency Updated"
- History shows previous level and new level
- Recent sessions weighted more heavily than old ones

#### 4.3 View Proficiency Trends
**Steps:**
1. Navigate to a worker's profile
2. View proficiency history for a specific step

**Expected Behavior:**
- Chart or timeline shows proficiency changes over time
- Can see when and why changes occurred
- Pattern visible (improving, declining, stable)

---

## Phase 5: 8-Week Production Schedule

### What You Should Be Able To Do
- View a schedule spanning 8 weeks
- See deadline warnings for at-risk orders
- View overtime requirements per day
- Run what-if scenarios (add/remove workers)

### Test Scenarios

#### 5.1 Generate 8-Week Schedule
**Steps:**
1. Create multiple orders with due dates spread across 8 weeks
2. Generate an 8-week schedule

**Expected Behavior:**
- Calendar view expands to show 8 weeks
- All orders' steps are scheduled
- Earlier deadlines prioritized
- Schedule respects all dependencies across the entire horizon

#### 5.2 View Deadline Warnings
**Steps:**
1. Create an order with an aggressive deadline (e.g., large quantity, short timeline)
2. Generate the schedule
3. Look for warnings

**Expected Behavior:**
- At-risk orders are highlighted in red
- Warning message explains the risk:
  - "Order X cannot be completed by due date with current resources"
  - "Order X requires 12 overtime hours to meet deadline"
- Calendar shows which days have deadline pressure

#### 5.3 View Overtime Indicators
**Steps:**
1. Generate a schedule with tight deadlines
2. View the weekly/daily schedule

**Expected Behavior:**
- Days requiring overtime show an overtime indicator
- Overtime hours are calculated and displayed (e.g., "+2 hrs")
- Can see total overtime required per week
- Overtime clearly distinguished from regular hours

#### 5.4 Run What-If Scenario: Add Worker
**Steps:**
1. View current schedule with deadline warnings
2. Open "What-If" scenario tool
3. Add a temporary worker with specific skills
4. Re-generate schedule in scenario mode

**Expected Behavior:**
- New schedule generates with additional worker
- Deadline warnings may reduce or disappear
- Shows comparison: "With new worker: meets all deadlines"
- Scenario doesn't affect actual schedule until confirmed
- Option to apply or discard scenario

#### 5.5 Run What-If Scenario: Remove Worker
**Steps:**
1. View current schedule
2. Open "What-If" scenario tool
3. Remove a worker (simulate absence/vacation)
4. Re-generate schedule in scenario mode

**Expected Behavior:**
- New schedule generates without that worker
- Impact shown:
  - Which orders are now at risk
  - How much overtime is now required
  - Which steps are affected
- Helps plan for worker absences

---

## General Testing Notes

### Environment Setup
- Ensure the app is running (both server and mobile/web client)
- Database should be seeded with Tenjam product data
- Test on both web browser and mobile device if possible

### Test Data
- Products: Use seeded Tenjam products
- Workers: A through H with varying skill levels
- Orders: Create fresh orders for each test scenario

### Reporting Issues
When reporting issues, include:
1. Which phase and scenario failed
2. Steps taken before the failure
3. Expected vs actual behavior
4. Screenshots if applicable
5. Any error messages displayed
