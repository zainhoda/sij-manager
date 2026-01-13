import { Database } from "bun:sqlite";

export function initDatabase(dbPath: string = "sij.db"): Database {
  const db = new Database(dbPath);

  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON");

  // Products table
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Equipment table
  db.run(`
    CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Workers table (human resources)
  db.run(`
    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      employee_id TEXT UNIQUE,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
      skill_category TEXT DEFAULT 'OTHER' CHECK (skill_category IN ('SEWING', 'OTHER')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Equipment certifications (worker-equipment junction table)
  db.run(`
    CREATE TABLE IF NOT EXISTS equipment_certifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      equipment_id INTEGER NOT NULL,
      certified_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
      FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
      UNIQUE (worker_id, equipment_id)
    )
  `);

  // Product steps table
  db.run(`
    CREATE TABLE IF NOT EXISTS product_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('CUTTING', 'SILKSCREEN', 'PREP', 'SEWING', 'INSPECTION')),
      time_per_piece_seconds INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      required_skill_category TEXT NOT NULL CHECK (required_skill_category IN ('SEWING', 'OTHER')),
      parent_step_code TEXT,
      equipment_id INTEGER,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id)
    )
  `);

  // Step dependencies (many-to-many)
  db.run(`
    CREATE TABLE IF NOT EXISTS step_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_id INTEGER NOT NULL,
      depends_on_step_id INTEGER NOT NULL,
      FOREIGN KEY (step_id) REFERENCES product_steps(id),
      FOREIGN KEY (depends_on_step_id) REFERENCES product_steps(id),
      UNIQUE (step_id, depends_on_step_id)
    )
  `);

  // Orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed')),
      color TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Worker proficiencies per step (1-5 scale)
  db.run(`
    CREATE TABLE IF NOT EXISTS worker_proficiencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      product_step_id INTEGER NOT NULL,
      level INTEGER NOT NULL DEFAULT 3 CHECK (level >= 1 AND level <= 5),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
      FOREIGN KEY (product_step_id) REFERENCES product_steps(id) ON DELETE CASCADE,
      UNIQUE (worker_id, product_step_id)
    )
  `);

  // Proficiency change history for analytics
  db.run(`
    CREATE TABLE IF NOT EXISTS proficiency_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      product_step_id INTEGER NOT NULL,
      old_level INTEGER NOT NULL,
      new_level INTEGER NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('manual', 'auto_increase', 'auto_decrease')),
      trigger_data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
      FOREIGN KEY (product_step_id) REFERENCES product_steps(id) ON DELETE CASCADE
    )
  `);

  // What-if scheduling scenarios
  db.run(`
    CREATE TABLE IF NOT EXISTS scheduling_scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 0,
      worker_pool TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Scenario schedule results
  db.run(`
    CREATE TABLE IF NOT EXISTS scenario_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      schedule_data TEXT NOT NULL,
      deadline_risk TEXT,
      overtime_hours REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scenario_id) REFERENCES scheduling_scenarios(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // Schedules table
  db.run(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      week_start_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // Schedule entries table
  // Note: worker_id, actual_start_time, actual_end_time, actual_output, status, notes
  // are deprecated - use task_worker_assignments instead for per-worker tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS schedule_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      product_step_id INTEGER NOT NULL,
      worker_id INTEGER,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      planned_output INTEGER NOT NULL,
      actual_start_time TEXT,
      actual_end_time TEXT,
      actual_output INTEGER DEFAULT 0,
      status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
      notes TEXT,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id),
      FOREIGN KEY (product_step_id) REFERENCES product_steps(id),
      FOREIGN KEY (worker_id) REFERENCES workers(id)
    )
  `);

  // Task worker assignments (multi-worker per task with per-worker time tracking)
  db.run(`
    CREATE TABLE IF NOT EXISTS task_worker_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_entry_id INTEGER NOT NULL,
      worker_id INTEGER NOT NULL,
      actual_start_time TEXT,
      actual_end_time TEXT,
      actual_output INTEGER DEFAULT 0,
      status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
      notes TEXT,
      assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_entry_id) REFERENCES schedule_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
      UNIQUE (schedule_entry_id, worker_id)
    )
  `);

  // Assignment output history (non-destructive tracking of output updates)
  // This allows tracking how output changes over time to calculate average time per piece
  db.run(`
    CREATE TABLE IF NOT EXISTS assignment_output_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      output INTEGER NOT NULL,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assignment_id) REFERENCES task_worker_assignments(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for common queries
  db.run("CREATE INDEX IF NOT EXISTS idx_product_steps_product ON product_steps(product_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_product_steps_equipment ON product_steps(equipment_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_schedules_order ON schedules(order_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_schedule_entries_schedule ON schedule_entries(schedule_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_schedule_entries_date ON schedule_entries(date)");
  db.run("CREATE INDEX IF NOT EXISTS idx_schedule_entries_worker ON schedule_entries(worker_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_equipment_certifications_worker ON equipment_certifications(worker_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_equipment_certifications_equipment ON equipment_certifications(equipment_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_worker_proficiencies_worker ON worker_proficiencies(worker_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_worker_proficiencies_step ON worker_proficiencies(product_step_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_proficiency_history_worker ON proficiency_history(worker_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_proficiency_history_step ON proficiency_history(product_step_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_scenario_schedules_scenario ON scenario_schedules(scenario_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_task_worker_assignments_entry ON task_worker_assignments(schedule_entry_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_task_worker_assignments_worker ON task_worker_assignments(worker_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_assignment_output_history_assignment ON assignment_output_history(assignment_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_assignment_output_history_recorded ON assignment_output_history(recorded_at)");

  return db;
}

// Type definitions for database rows
export interface Product {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ProductStep {
  id: number;
  product_id: number;
  name: string;
  category: 'CUTTING' | 'SILKSCREEN' | 'PREP' | 'SEWING' | 'INSPECTION';
  time_per_piece_seconds: number;
  sequence: number;
  required_skill_category: 'SEWING' | 'OTHER';
  parent_step_code: string | null;
  equipment_id: number | null;
}

export interface StepDependency {
  id: number;
  step_id: number;
  depends_on_step_id: number;
}

export interface Order {
  id: number;
  product_id: number;
  quantity: number;
  due_date: string;
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed';
  color: string | null;
  created_at: string;
}

export interface Schedule {
  id: number;
  order_id: number;
  week_start_date: string;
  created_at: string;
}

export interface ScheduleEntry {
  id: number;
  schedule_id: number;
  product_step_id: number;
  worker_id: number | null;
  date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  actual_start_time: string | null;
  actual_end_time: string | null;
  actual_output: number;
  status: 'not_started' | 'in_progress' | 'completed';
  notes: string | null;
}

export interface Equipment {
  id: number;
  name: string;
  description: string | null;
  status: 'available' | 'in_use' | 'maintenance' | 'retired';
  created_at: string;
}

export interface Worker {
  id: number;
  name: string;
  employee_id: string | null;
  status: 'active' | 'inactive' | 'on_leave';
  skill_category: 'SEWING' | 'OTHER';
  created_at: string;
}

export interface EquipmentCertification {
  id: number;
  worker_id: number;
  equipment_id: number;
  certified_at: string;
  expires_at: string | null;
}

export interface WorkerProficiency {
  id: number;
  worker_id: number;
  product_step_id: number;
  level: 1 | 2 | 3 | 4 | 5;
  created_at: string;
  updated_at: string;
}

export interface ProficiencyHistory {
  id: number;
  worker_id: number;
  product_step_id: number;
  old_level: number;
  new_level: number;
  reason: 'manual' | 'auto_increase' | 'auto_decrease';
  trigger_data: string | null;
  created_at: string;
}

export interface SchedulingScenario {
  id: number;
  name: string;
  description: string | null;
  is_active: number;
  worker_pool: string;
  created_at: string;
}

export interface ScenarioSchedule {
  id: number;
  scenario_id: number;
  order_id: number;
  schedule_data: string;
  deadline_risk: string | null;
  overtime_hours: number;
  created_at: string;
}

export interface TaskWorkerAssignment {
  id: number;
  schedule_entry_id: number;
  worker_id: number;
  actual_start_time: string | null;
  actual_end_time: string | null;
  actual_output: number;
  status: 'not_started' | 'in_progress' | 'completed';
  notes: string | null;
  assigned_at: string;
}

export interface AssignmentOutputHistory {
  id: number;
  assignment_id: number;
  output: number;
  recorded_at: string;
}
