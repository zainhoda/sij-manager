import { createClient, type Client } from "@libsql/client";

export function initDatabase(url: string = process.env.TURSO_DATABASE_URL || "file:sij.db", authToken?: string): Client {
  return createClient({
    url,
    authToken: authToken || process.env.TURSO_AUTH_TOKEN,
  });
}

export async function ensureSchema(db: Client) {
  // Enable foreign keys
  await db.execute("PRAGMA foreign_keys = ON");

  // ============================================================
  // SETUP TABLES (Keep from old schema)
  // ============================================================

  // Work categories table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS work_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Components table (product components like "Small Velcro Pocket")
  await db.execute(`
    CREATE TABLE IF NOT EXISTS components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Equipment table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),
      station_count INTEGER DEFAULT 1,
      work_category_id INTEGER,
      hourly_cost REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (work_category_id) REFERENCES work_categories(id)
    )
  `);

  // Workers table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      employee_id TEXT UNIQUE,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
      skill_category TEXT DEFAULT 'OTHER' CHECK (skill_category IN ('SEWING', 'OTHER')),
      work_category_id INTEGER,
      cost_per_hour REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (work_category_id) REFERENCES work_categories(id)
    )
  `);

  // Equipment certifications (worker-equipment junction)
  await db.execute(`
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

  // ============================================================
  // FISHBOWL CACHE TABLES (Keep from old schema)
  // ============================================================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fishbowl_bom_cache (
      id INTEGER PRIMARY KEY,
      num TEXT NOT NULL UNIQUE,
      description TEXT,
      revision TEXT,
      active_flag INTEGER DEFAULT 1,
      cached_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fishbowl_bomitem_cache (
      id INTEGER PRIMARY KEY,
      bom_id INTEGER NOT NULL,
      part_id INTEGER,
      part_num TEXT,
      part_description TEXT,
      quantity REAL,
      type_id INTEGER,
      cached_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bom_id) REFERENCES fishbowl_bom_cache(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fishbowl_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      records_synced INTEGER DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      error TEXT
    )
  `);

  // ============================================================
  // BOM STEPS - Labor steps linked to Fishbowl BOMs
  // ============================================================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS bom_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fishbowl_bom_id INTEGER NOT NULL,
      fishbowl_bom_num TEXT NOT NULL,
      name TEXT NOT NULL,
      step_code TEXT,
      details TEXT,
      time_per_piece_seconds INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      work_category_id INTEGER,
      equipment_id INTEGER,
      component_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (work_category_id) REFERENCES work_categories(id),
      FOREIGN KEY (equipment_id) REFERENCES equipment(id),
      FOREIGN KEY (component_id) REFERENCES components(id)
    )
  `);

  // Step configurations (versions) per BOM
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bom_step_configurations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fishbowl_bom_id INTEGER NOT NULL,
      fishbowl_bom_num TEXT NOT NULL,
      config_name TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deprecated')),
      is_default INTEGER DEFAULT 0,
      total_time_seconds INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (fishbowl_bom_id, version_number)
    )
  `);

  // Links configurations to steps
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bom_config_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL,
      bom_step_id INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      FOREIGN KEY (config_id) REFERENCES bom_step_configurations(id) ON DELETE CASCADE,
      FOREIGN KEY (bom_step_id) REFERENCES bom_steps(id),
      UNIQUE (config_id, bom_step_id)
    )
  `);

  // Step dependencies
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bom_step_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_id INTEGER NOT NULL,
      depends_on_step_id INTEGER NOT NULL,
      dependency_type TEXT DEFAULT 'finish' CHECK (dependency_type IN ('start', 'finish')),
      lag_seconds INTEGER DEFAULT 0,
      FOREIGN KEY (step_id) REFERENCES bom_steps(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on_step_id) REFERENCES bom_steps(id) ON DELETE CASCADE,
      UNIQUE (step_id, depends_on_step_id)
    )
  `);

  // ============================================================
  // DEMAND POOL - Global demand entries
  // ============================================================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS demand_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Source identification
      source TEXT NOT NULL CHECK (source IN ('fishbowl_so', 'fishbowl_wo', 'manual')),
      fishbowl_so_id INTEGER,
      fishbowl_so_num TEXT,
      fishbowl_so_item_id INTEGER,
      fishbowl_wo_id INTEGER,
      fishbowl_wo_num TEXT,

      -- What to make
      fishbowl_bom_id INTEGER NOT NULL,
      fishbowl_bom_num TEXT NOT NULL,
      step_config_id INTEGER,

      -- How much and when
      quantity INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      target_completion_date TEXT NOT NULL,

      -- Prioritization
      priority INTEGER DEFAULT 3,
      customer_name TEXT,
      notes TEXT,

      -- Status tracking
      status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending',
        'planned',
        'in_progress',
        'completed',
        'cancelled'
      )),

      -- Progress
      quantity_completed INTEGER DEFAULT 0,

      -- Visual
      color TEXT,

      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (step_config_id) REFERENCES bom_step_configurations(id)
    )
  `);

  // ============================================================
  // PLANNING - Runs and Scenarios
  // ============================================================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS planning_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,

      -- Planning horizon
      planning_start_date TEXT NOT NULL,
      planning_end_date TEXT NOT NULL,

      -- Which scenario was accepted
      accepted_scenario_id INTEGER,

      -- Status
      status TEXT DEFAULT 'draft' CHECK (status IN (
        'draft',
        'pending',
        'accepted',
        'executed',
        'archived'
      )),

      -- Audit
      created_by TEXT,
      accepted_by TEXT,
      accepted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS planning_scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      planning_run_id INTEGER NOT NULL,

      -- Scenario identity
      name TEXT NOT NULL,
      strategy TEXT NOT NULL CHECK (strategy IN (
        'meet_deadlines',
        'minimize_cost',
        'balanced',
        'custom'
      )),

      -- Constraints used
      allow_overtime INTEGER DEFAULT 0,
      overtime_limit_hours_per_day REAL DEFAULT 2.5,
      worker_pool_json TEXT,
      efficiency_factor INTEGER DEFAULT 100,

      -- Results
      total_labor_hours REAL,
      total_overtime_hours REAL,
      total_labor_cost REAL,
      total_equipment_cost REAL,
      deadlines_met INTEGER,
      deadlines_missed INTEGER,
      latest_completion_date TEXT,

      -- Scenario data
      schedule_json TEXT,
      warnings_json TEXT,

      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (planning_run_id) REFERENCES planning_runs(id) ON DELETE CASCADE
    )
  `);

  // Demand entries included in each scenario
  await db.execute(`
    CREATE TABLE IF NOT EXISTS scenario_demand_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id INTEGER NOT NULL,
      demand_entry_id INTEGER NOT NULL,

      -- Scenario-specific adjustments
      adjusted_target_date TEXT,
      assigned_priority INTEGER,
      projected_completion_date TEXT,
      can_meet_target INTEGER,

      FOREIGN KEY (scenario_id) REFERENCES planning_scenarios(id) ON DELETE CASCADE,
      FOREIGN KEY (demand_entry_id) REFERENCES demand_entries(id),
      UNIQUE (scenario_id, demand_entry_id)
    )
  `);

  // ============================================================
  // EXECUTION - Plan Tasks and Assignments
  // ============================================================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS plan_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      planning_run_id INTEGER NOT NULL,
      demand_entry_id INTEGER NOT NULL,
      bom_step_id INTEGER NOT NULL,

      -- Scheduling
      scheduled_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      planned_output INTEGER NOT NULL,

      -- Execution status
      status TEXT DEFAULT 'not_started' CHECK (status IN (
        'not_started',
        'in_progress',
        'completed',
        'blocked',
        'cancelled'
      )),

      -- Actuals
      actual_start_time TEXT,
      actual_end_time TEXT,
      actual_output INTEGER DEFAULT 0,

      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (planning_run_id) REFERENCES planning_runs(id),
      FOREIGN KEY (demand_entry_id) REFERENCES demand_entries(id),
      FOREIGN KEY (bom_step_id) REFERENCES bom_steps(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_task_id INTEGER NOT NULL,
      worker_id INTEGER NOT NULL,

      -- Actuals
      actual_start_time TEXT,
      actual_end_time TEXT,
      actual_output INTEGER DEFAULT 0,
      status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
      notes TEXT,
      assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (plan_task_id) REFERENCES plan_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
    )
  `);

  // ============================================================
  // HISTORICAL TRACKING
  // ============================================================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS production_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- What was produced
      demand_entry_id INTEGER,
      fishbowl_bom_id INTEGER NOT NULL,
      fishbowl_bom_num TEXT NOT NULL,
      bom_step_id INTEGER NOT NULL,
      step_name TEXT NOT NULL,

      -- Worker performance
      worker_id INTEGER NOT NULL,
      worker_name TEXT NOT NULL,

      -- Production metrics
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      units_produced INTEGER NOT NULL,
      planned_units INTEGER,

      -- Time metrics
      actual_seconds INTEGER NOT NULL,
      expected_seconds INTEGER,
      efficiency_percent REAL,

      -- Cost tracking
      labor_cost REAL,
      equipment_cost REAL,

      -- Source
      plan_task_id INTEGER,

      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (demand_entry_id) REFERENCES demand_entries(id),
      FOREIGN KEY (bom_step_id) REFERENCES bom_steps(id),
      FOREIGN KEY (worker_id) REFERENCES workers(id),
      FOREIGN KEY (plan_task_id) REFERENCES plan_tasks(id)
    )
  `);

  // Aggregated worker efficiency by step
  await db.execute(`
    CREATE TABLE IF NOT EXISTS worker_step_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      bom_step_id INTEGER NOT NULL,

      -- Aggregated metrics
      total_units_produced INTEGER DEFAULT 0,
      total_actual_seconds INTEGER DEFAULT 0,
      total_expected_seconds INTEGER DEFAULT 0,
      avg_efficiency_percent REAL,
      sample_count INTEGER DEFAULT 0,

      -- Trend
      recent_efficiency_percent REAL,
      trend TEXT CHECK (trend IN ('improving', 'stable', 'declining')),

      last_updated TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
      FOREIGN KEY (bom_step_id) REFERENCES bom_steps(id) ON DELETE CASCADE,
      UNIQUE (worker_id, bom_step_id)
    )
  `);

  // ============================================================
  // INDEXES
  // ============================================================

  // Setup tables
  await db.execute("CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_equipment_work_category ON equipment(work_category_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_workers_work_category ON workers(work_category_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_equipment_certifications_worker ON equipment_certifications(worker_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_equipment_certifications_equipment ON equipment_certifications(equipment_id)");

  // Fishbowl cache
  await db.execute("CREATE INDEX IF NOT EXISTS idx_fishbowl_bomitem_cache_bom ON fishbowl_bomitem_cache(bom_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_fishbowl_sync_log_entity ON fishbowl_sync_log(entity_type, entity_id)");

  // BOM steps
  await db.execute("CREATE INDEX IF NOT EXISTS idx_bom_steps_bom ON bom_steps(fishbowl_bom_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_bom_steps_code ON bom_steps(step_code)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_bom_steps_equipment ON bom_steps(equipment_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_bom_step_configs_bom ON bom_step_configurations(fishbowl_bom_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_bom_config_steps_config ON bom_config_steps(config_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_bom_step_deps_step ON bom_step_dependencies(step_id)");

  // Demand
  await db.execute("CREATE INDEX IF NOT EXISTS idx_demand_entries_status ON demand_entries(status)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_demand_entries_bom ON demand_entries(fishbowl_bom_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_demand_entries_due ON demand_entries(due_date)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_demand_entries_so ON demand_entries(fishbowl_so_id)");

  // Planning
  await db.execute("CREATE INDEX IF NOT EXISTS idx_planning_runs_status ON planning_runs(status)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_planning_scenarios_run ON planning_scenarios(planning_run_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_scenario_demand_scenario ON scenario_demand_entries(scenario_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_scenario_demand_entry ON scenario_demand_entries(demand_entry_id)");

  // Execution
  await db.execute("CREATE INDEX IF NOT EXISTS idx_plan_tasks_run ON plan_tasks(planning_run_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_plan_tasks_demand ON plan_tasks(demand_entry_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_plan_tasks_date ON plan_tasks(scheduled_date)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_plan_tasks_status ON plan_tasks(status)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(plan_task_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_task_assignments_worker ON task_assignments(worker_id)");

  // History
  await db.execute("CREATE INDEX IF NOT EXISTS idx_production_history_bom ON production_history(fishbowl_bom_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_production_history_worker ON production_history(worker_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_production_history_date ON production_history(date)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_worker_step_performance_worker ON worker_step_performance(worker_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_worker_step_performance_step ON worker_step_performance(bom_step_id)");

  // ============================================================
  // MIGRATIONS - Add columns to existing tables
  // ============================================================

  // Add details column to bom_steps (for existing databases)
  try {
    await db.execute("ALTER TABLE bom_steps ADD COLUMN details TEXT");
  } catch {
    // Column already exists
  }

  // ============================================================
  // SEED DATA - Work categories matching Fishbowl instruction names
  // ============================================================

  const defaultCategories = [
    { name: "Sewing Dept.", description: "Sewing operations" },
    { name: "Cutting Dept.", description: "Cutting operations" },
    { name: "Screening Dept.", description: "Screen printing / silk screening" },
    { name: "Inspection", description: "Quality inspection" },
    { name: "Packing", description: "Packaging and shipping prep" },
    { name: "Prep", description: "Preparation work" },
    { name: "Finishing Dept.", description: "Final finishing operations" },
    { name: "Assembly", description: "Assembly operations" },
  ];

  for (const cat of defaultCategories) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO work_categories (name, description) VALUES (?, ?)",
      args: [cat.name, cat.description],
    });
  }
}

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface WorkCategory {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Component {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Equipment {
  id: number;
  name: string;
  description: string | null;
  status: 'available' | 'in_use' | 'maintenance' | 'retired';
  station_count: number;
  work_category_id: number | null;
  hourly_cost: number;
  created_at: string;
}

export interface Worker {
  id: number;
  name: string;
  employee_id: string | null;
  status: 'active' | 'inactive' | 'on_leave';
  skill_category: 'SEWING' | 'OTHER';
  work_category_id: number | null;
  cost_per_hour: number;
  created_at: string;
}

export interface EquipmentCertification {
  id: number;
  worker_id: number;
  equipment_id: number;
  certified_at: string;
  expires_at: string | null;
}

export interface FishbowlBOMCache {
  id: number;
  num: string;
  description: string | null;
  revision: string | null;
  active_flag: number;
  cached_at: string;
}

export interface FishbowlBOMItemCache {
  id: number;
  bom_id: number;
  part_id: number | null;
  part_num: string | null;
  part_description: string | null;
  quantity: number | null;
  type_id: number | null;
  cached_at: string;
}

export interface FishbowlSyncLog {
  id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  records_synced: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface BOMStep {
  id: number;
  fishbowl_bom_id: number;
  fishbowl_bom_num: string;
  name: string;
  step_code: string | null;
  time_per_piece_seconds: number;
  sequence: number;
  work_category_id: number | null;
  equipment_id: number | null;
  component_id: number | null;
  created_at: string;
}

export interface BOMStepConfiguration {
  id: number;
  fishbowl_bom_id: number;
  fishbowl_bom_num: string;
  config_name: string;
  version_number: number;
  description: string | null;
  status: 'draft' | 'active' | 'deprecated';
  is_default: number;
  total_time_seconds: number | null;
  created_at: string;
}

export interface BOMConfigStep {
  id: number;
  config_id: number;
  bom_step_id: number;
  sequence: number;
}

export interface BOMStepDependency {
  id: number;
  step_id: number;
  depends_on_step_id: number;
  dependency_type: 'start' | 'finish';
  lag_seconds: number;
}

export interface DemandEntry {
  id: number;
  source: 'fishbowl_so' | 'fishbowl_wo' | 'manual';
  fishbowl_so_id: number | null;
  fishbowl_so_num: string | null;
  fishbowl_so_item_id: number | null;
  fishbowl_wo_id: number | null;
  fishbowl_wo_num: string | null;
  fishbowl_bom_id: number;
  fishbowl_bom_num: string;
  step_config_id: number | null;
  quantity: number;
  due_date: string;
  target_completion_date: string;
  priority: number;
  customer_name: string | null;
  notes: string | null;
  status: 'pending' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
  quantity_completed: number;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanningRun {
  id: number;
  name: string;
  description: string | null;
  planning_start_date: string;
  planning_end_date: string;
  accepted_scenario_id: number | null;
  status: 'draft' | 'pending' | 'accepted' | 'executed' | 'archived';
  created_by: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface PlanningScenario {
  id: number;
  planning_run_id: number;
  name: string;
  strategy: 'meet_deadlines' | 'minimize_cost' | 'balanced' | 'custom';
  allow_overtime: number;
  overtime_limit_hours_per_day: number;
  worker_pool_json: string | null;
  efficiency_factor: number;
  total_labor_hours: number | null;
  total_overtime_hours: number | null;
  total_labor_cost: number | null;
  total_equipment_cost: number | null;
  deadlines_met: number | null;
  deadlines_missed: number | null;
  latest_completion_date: string | null;
  schedule_json: string | null;
  warnings_json: string | null;
  created_at: string;
}

export interface ScenarioDemandEntry {
  id: number;
  scenario_id: number;
  demand_entry_id: number;
  adjusted_target_date: string | null;
  assigned_priority: number | null;
  projected_completion_date: string | null;
  can_meet_target: number | null;
}

export interface PlanTask {
  id: number;
  planning_run_id: number;
  demand_entry_id: number;
  bom_step_id: number;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  actual_start_time: string | null;
  actual_end_time: string | null;
  actual_output: number;
  notes: string | null;
  created_at: string;
}

export interface TaskAssignment {
  id: number;
  plan_task_id: number;
  worker_id: number;
  actual_start_time: string | null;
  actual_end_time: string | null;
  actual_output: number;
  status: 'not_started' | 'in_progress' | 'completed';
  notes: string | null;
  assigned_at: string;
}

export interface ProductionHistory {
  id: number;
  demand_entry_id: number | null;
  fishbowl_bom_id: number;
  fishbowl_bom_num: string;
  bom_step_id: number;
  step_name: string;
  worker_id: number;
  worker_name: string;
  date: string;
  start_time: string;
  end_time: string;
  units_produced: number;
  planned_units: number | null;
  actual_seconds: number;
  expected_seconds: number | null;
  efficiency_percent: number | null;
  labor_cost: number | null;
  equipment_cost: number | null;
  plan_task_id: number | null;
  recorded_at: string;
}

export interface WorkerStepPerformance {
  id: number;
  worker_id: number;
  bom_step_id: number;
  total_units_produced: number;
  total_actual_seconds: number;
  total_expected_seconds: number;
  avg_efficiency_percent: number | null;
  sample_count: number;
  recent_efficiency_percent: number | null;
  trend: 'improving' | 'stable' | 'declining' | null;
  last_updated: string;
}
