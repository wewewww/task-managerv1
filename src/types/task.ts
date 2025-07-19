export type TaskArea = 'personal' | 'work' | 'business' | 'academic';

export type TaskStatus = 'open' | 'complete';

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  area: TaskArea | string; // Now can be a custom category
  dateNoted: Date;
  dueDate?: Date;
  estTimeHrs?: number; // Estimated time in hours
  realTimeHrs?: number;
  importance: number; // 1-10
  priorityScore?: number;
  status: TaskStatus;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  interval?: number;
  weekdays?: number[]; // 0-6 (Sunday-Saturday)
  nextDate?: Date;
}

export interface CreateTaskData {
  title: string;
  description?: string;
  area: TaskArea | string;
  dueDate?: Date;
  estTimeHrs?: number; // Estimated time in hours
  importance: number;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  interval?: number;
  weekdays?: number[];
}

// Global settings for urgency calculation
export interface UserSettings {
  hoursPerDay: number; // Available hours per day for tasks
} 