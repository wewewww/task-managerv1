"use client";

import React, { useState, useEffect } from 'react';
import { useTasks } from '../hooks/useTasks';
import { Task, TaskArea, Category } from '../types/task';
import { useAuth } from '../hooks/useAuth';
import { notificationService } from '../lib/notificationService';
import { db, functions } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { User } from 'firebase/auth';

// TypeScript declarations for reCAPTCHA
declare global {
  interface Window {
    grecaptcha: {
      enterprise: {
        ready: (callback: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
      };
    };
  }
}

const AREA_OPTIONS: { label: string; value: TaskArea; color: string }[] = [
  { label: 'Personal', value: 'personal', color: '#10b981' },
  { label: 'Work', value: 'work', color: '#3b82f6' },
  { label: 'Business', value: 'business', color: '#f59e0b' },
  { label: 'Academic', value: 'academic', color: '#8b5cf6' },
  { label: 'Inbox', value: 'inbox', color: '#6b7280' },
];

// Default hours per day available for tasks
const DEFAULT_HOURS_PER_DAY = 8;

// Calculate urgency based on workload vs available time (Excel formula implementation)
function calculateUrgency(task: Task, hoursPerDay: number = DEFAULT_HOURS_PER_DAY): number {
  // If no due date or estimated time, return default urgency
  if (!task.dueDate || !task.estTimeHrs) {
    return 5; // Default middle urgency
  }

  // Calculate available days (business days) until deadline
  const now = new Date();
  const dueDate = new Date(task.dueDate);
  const timeDiff = dueDate.getTime() - now.getTime();
  const daysAvailable = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));

  // Calculate available hours
  const hoursAvailable = daysAvailable * hoursPerDay;

  // If no time available, maximum urgency
  if (hoursAvailable <= 0) {
    return 10;
  }

  // Calculate ratio (hours needed / hours available)
  const ratio = task.estTimeHrs / hoursAvailable;

  // Apply Excel formula: 1 + 9 * ratio, clamped between 1 and 10
  const urgency = Math.round(1 + 9 * ratio);
  return Math.min(10, Math.max(1, urgency));
}

// Helper functions for quadrant calculations
function getQuadrant(importance: number, urgency: number) {
  if (importance >= 6 && urgency >= 6) return "urgent-important";
  if (importance >= 6 && urgency < 6) return "important-not-urgent";
  if (importance < 6 && urgency >= 6) return "urgent-not-important";
  return "not-urgent-not-important";
}

function getQuadrantLabel(quadrant: string) {
  switch (quadrant) {
    case 'urgent-important': return 'Urgent & Important';
    case 'important-not-urgent': return 'Important, Not Urgent';
    case 'urgent-not-important': return 'Urgent, Not Important';
    case 'not-urgent-not-important': return 'Not Urgent, Not Important';
    default: return '';
  }
}



// Task Detail Modal Component
function TaskDetailModal({ task, urgencyValue, onClose, onEdit }: { 
  task: Task; 
  urgencyValue: number; 
  onClose: () => void; 
  onEdit: (task: Task) => void;
}) {
  const getAreaColor = (areaValue: TaskArea | string) => {
    // First check if it's a default area
    const defaultArea = AREA_OPTIONS.find(opt => opt.value === areaValue);
    if (defaultArea) return defaultArea.color;
    
    // Default fallback
    return '#6b7280';
  };



  const quadrant = getQuadrant(task.importance, urgencyValue);
  const quadrantLabel = getQuadrantLabel(quadrant);

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 border border-slate-600 rounded-xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Task Details</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(task)}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Task Title */}
          <div>
            <h4 className="text-white font-medium text-lg mb-2">{task.title}</h4>
            <div className="flex items-center gap-2">
              <span 
                className="px-3 py-1 text-sm font-medium rounded-full text-white"
                style={{ backgroundColor: getAreaColor(task.area) }}
              >
                {task.area}
              </span>
              <span className="px-3 py-1 text-sm font-medium bg-slate-600 text-slate-300 rounded-full">
                I: {task.importance}/10
              </span>
              <span className="px-3 py-1 text-sm font-medium bg-orange-600 text-white rounded-full">
                U: {urgencyValue}/10
              </span>
            </div>
          </div>

          {/* Quadrant Information */}
          <div className="bg-slate-700/50 rounded-lg p-3">
            <div className="text-sm text-slate-300 mb-1">Matrix Position:</div>
            <div className="text-white font-medium">{quadrantLabel}</div>
          </div>

          {/* Time Information */}
          <div className="space-y-2">
            {task.estTimeHrs && (
              <div className="flex justify-between">
                <span className="text-slate-400">Estimated Time:</span>
                <span className="text-white">{task.estTimeHrs} hours</span>
              </div>
            )}
            {task.dueDate && (
              <div className="flex justify-between">
                <span className="text-slate-400">Due Date:</span>
                <span className="text-white">
                  {new Date(task.dueDate).toLocaleDateString('en-US', { 
                    weekday: 'long',
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </span>
              </div>
            )}
            {task.dueDate && task.estTimeHrs && (
              <div className="flex justify-between">
                <span className="text-slate-400">Days Remaining:</span>
                <span className="text-white">
                  {Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))} days
                </span>
              </div>
            )}
          </div>

          {/* Description if available */}
          {task.description && (
            <div>
              <div className="text-sm text-slate-400 mb-1">Description:</div>
              <div className="text-white text-sm bg-slate-700/50 rounded p-2">
                {task.description}
              </div>
            </div>
          )}

          {/* Created Date */}
          <div className="text-xs text-slate-500">
            Created: {task.dateNoted.toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Edit Task Modal Component
function EditTaskModal({ 
  task, 
  onClose, 
  onSave, 
  categories 
}: { 
  task: Task; 
  onClose: () => void; 
  onSave: (taskId: string, updates: Partial<Task>) => Promise<void>;
  categories: Category[];
}) {
  const [formData, setFormData] = useState({
    title: task.title,
    description: task.description || '',
    area: task.area,
    importance: task.importance,
    dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
    estTimeHrs: task.estTimeHrs ? task.estTimeHrs.toString() : ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const updates: Partial<Task> = {
        title: formData.title,
        description: formData.description || undefined,
        area: formData.area,
        importance: formData.importance,
        dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
        estTimeHrs: formData.estTimeHrs ? parseFloat(formData.estTimeHrs) : undefined
      };

      await onSave(task.id, updates);
      onClose();
    } catch {
      setError('Failed to update task. Please try again.');
    } finally {
      setLoading(false);
    }
  };

    

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 border border-slate-600 rounded-xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Edit Task</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl font-bold"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Task Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter task title"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Enter task description (optional)"
              rows={3}
            />
          </div>

          {/* Area/Category */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Category
            </label>
            <select
              value={formData.area}
              onChange={(e) => setFormData({...formData, area: e.target.value})}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {AREA_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              {categories.map(category => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* Importance and Due Date Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Importance (1-10)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={formData.importance}
                onChange={(e) => setFormData({...formData, importance: parseInt(e.target.value)})}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Due Date
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Estimated Time */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Estimated Time (hours)
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={formData.estTimeHrs}
              onChange={(e) => setFormData({...formData, estTimeHrs: e.target.value})}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 2.5"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-400 text-sm">{error}</div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Calendar Workload Component
function DailyTasksModal({ 
  date, 
  tasks, 
  onClose, 
  onViewTask
}: { 
  date: Date; 
  tasks: Task[]; 
  onClose: () => void; 
  onViewTask: (task: Task) => void;
}) {
  const getAreaColor = (areaValue: TaskArea | string) => {
    const defaultArea = AREA_OPTIONS.find(opt => opt.value === areaValue);
    if (defaultArea) return defaultArea.color;
    return '#6b7280';
  };

  const dateStr = date.toDateString();
  const tasksForDay = tasks.filter(task => {
    if (!task.dueDate || task.status === 'complete') return false;
    return new Date(task.dueDate).toDateString() === dateStr;
  });

  const totalHours = tasksForDay.reduce((sum, task) => sum + (task.estTimeHrs || 0), 0);

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 border border-slate-600 rounded-xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Tasks for {date.toLocaleDateString('en-US', { 
              weekday: 'long',
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-slate-700/50 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Total Tasks:</span>
              <span className="text-white font-medium">{tasksForDay.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Total Hours:</span>
              <span className="text-white font-medium">{totalHours}h</span>
            </div>
          </div>

          {/* Tasks List */}
          {tasksForDay.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-slate-400 text-sm mb-1">No tasks due on this day</div>
              <p className="text-slate-500 text-xs">You have a free day!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasksForDay.map(task => (
                <div 
                  key={task.id}
                  className="bg-slate-700/30 border border-slate-600 rounded-lg p-3 cursor-pointer hover:bg-slate-700/50 transition-colors"
                  onClick={() => onViewTask(task)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-white font-medium truncate">{task.title}</h4>
                        <span 
                          className="px-2 py-0.5 text-xs font-medium rounded-full text-white flex-shrink-0"
                          style={{ backgroundColor: getAreaColor(task.area) }}
                        >
                          {task.area}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>I: {task.importance}/10</span>
                        {task.estTimeHrs && <span>Est: {task.estTimeHrs}h</span>}
                      </div>
                      {task.description && (
                        <div className="text-xs text-slate-400 mt-1 truncate">
                          {task.description}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarWorkload({ 
  tasks, 
  hoursPerDay, 
  onDayClick 
}: { 
  tasks: Task[]; 
  hoursPerDay: number; 
  onDayClick: (date: Date) => void;
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const today = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  
  // Get first day of month and number of days
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  
  // Calculate starting day of week (0 = Sunday, but we want Monday = 0)
  let startingDayOfWeek = firstDay.getDay() - 1; // Convert to Monday-based
  if (startingDayOfWeek < 0) startingDayOfWeek = 6; // Sunday becomes 6
  
  // Calculate workload for each day
  const getDayWorkload = (day: number) => {
    const date = new Date(currentYear, currentMonth, day);
    const dateStr = date.toDateString();
    
    // Find tasks due on this day
    const tasksForDay = tasks.filter(task => {
      if (!task.dueDate || task.status === 'complete') return false;
      return new Date(task.dueDate).toDateString() === dateStr;
    });
    
    // Calculate total estimated hours for the day
    const totalHours = tasksForDay.reduce((sum, task) => {
      return sum + (task.estTimeHrs || 0);
    }, 0);
    
    return {
      totalHours,
      tasks: tasksForDay,
      workloadRatio: totalHours / hoursPerDay // 0 = no work, 1 = full day, >1 = overloaded
    };
  };
  
  // Get workload intensity color
  const getWorkloadColor = (workloadRatio: number) => {
    if (workloadRatio === 0) return 'bg-slate-700/30'; // No work
    if (workloadRatio <= 0.3) return 'bg-green-500/30'; // Light workload
    if (workloadRatio <= 0.6) return 'bg-yellow-500/30'; // Medium workload
    if (workloadRatio <= 1.0) return 'bg-orange-500/30'; // Heavy workload
    return 'bg-red-500/30'; // Overloaded
  };
  
  const getWorkloadBorder = (workloadRatio: number) => {
    if (workloadRatio === 0) return 'border-slate-600';
    if (workloadRatio <= 0.3) return 'border-green-500/50';
    if (workloadRatio <= 0.6) return 'border-yellow-500/50';
    if (workloadRatio <= 1.0) return 'border-orange-500/50';
    return 'border-red-500/50';
  };
  
  // Create calendar grid
  const calendarDays = [];
  
  // Add empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }
  
  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  // Monday-based day names
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  // Navigation functions
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };
  
  const goToNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };
  
  const goToToday = () => {
    setCurrentDate(new Date());
  };
  
  return (
    <div className="mt-4 sm:mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
        <div className="flex items-center justify-center sm:justify-start gap-2">
          <button
            onClick={goToPreviousMonth}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            ◀
          </button>
          <h3 className="text-sm sm:text-base font-semibold text-white min-w-[120px] sm:min-w-[140px] text-center">
            {monthNames[currentMonth]} {currentYear}
          </h3>
          <button
            onClick={goToNextMonth}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            ▶
          </button>
        </div>
        <div className="flex items-center justify-center sm:justify-end gap-2">
          <button
            onClick={goToToday}
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Today
          </button>
          <div className="text-xs text-slate-400">
            Workload
          </div>
        </div>
      </div>
      
      {/* Calendar Grid - Responsive */}
      <div className="bg-slate-700/20 rounded-lg p-2 border border-slate-600">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {dayNames.map(day => (
            <div key={day} className="text-xs font-medium text-slate-400 text-center py-1">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar days - Responsive */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className="h-6 sm:h-7"></div>;
            }
            
            const workload = getDayWorkload(day);
            const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
            
            return (
              <div
                key={`day-${currentYear}-${currentMonth}-${day}`}
                className={`h-6 sm:h-7 rounded border ${getWorkloadColor(workload.workloadRatio)} ${getWorkloadBorder(workload.workloadRatio)} flex items-center justify-center cursor-pointer hover:scale-105 transition-transform ${
                  isToday ? 'ring-1 ring-blue-400' : ''
                }`}
                title={`${day} ${monthNames[currentMonth]}\n${workload.totalHours}h workload (${Math.round(workload.workloadRatio * 100)}%)\n${workload.tasks.length} tasks due`}
                onClick={() => onDayClick(new Date(currentYear, currentMonth, day))}
              >
                <span className={`text-xs font-medium ${
                  workload.workloadRatio > 0 ? 'text-white' : 'text-slate-400'
                } ${isToday ? 'font-bold' : ''}`}>
                  {day}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Workload Legend - Responsive */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500/30 border border-green-500/50 rounded"></div>
          <span className="text-slate-400">Light</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-yellow-500/30 border border-yellow-500/50 rounded"></div>
          <span className="text-slate-400">Medium</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-orange-500/30 border border-orange-500/50 rounded"></div>
          <span className="text-slate-400">Heavy</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-red-500/30 border border-red-500/50 rounded"></div>
          <span className="text-slate-400">Overloaded</span>
        </div>
      </div>
    </div>
  );
}

// Move CategoryModal OUTSIDE HomePage
function CategoryModal({
  categories,
  addCategory,
  updateCategory,
  deleteCategory,
  editingCategory,
  setEditingCategory,
  newCategoryName,
  setNewCategoryName,
  newCategoryColor,
  setNewCategoryColor,
  setShowCategoryModal,
}: {
  categories: Category[];
  addCategory: (name: string, color: string) => Promise<Category>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  editingCategory: Category | null;
  setEditingCategory: React.Dispatch<React.SetStateAction<Category | null>>;
  newCategoryName: string;
  setNewCategoryName: React.Dispatch<React.SetStateAction<string>>;
  newCategoryColor: string;
  setNewCategoryColor: React.Dispatch<React.SetStateAction<string>>;
  setShowCategoryModal: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div 
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={() => setShowCategoryModal(false)}
    >
      <div 
        className="bg-slate-800 border border-slate-600 rounded-xl p-4 sm:p-6 w-full max-w-sm shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Manage Categories</h3>
          <button onClick={() => setShowCategoryModal(false)} className="text-slate-400 hover:text-white text-xl font-bold transition-colors">×</button>
        </div>
        <div className="mb-4">
          <p className="text-slate-400 text-sm mb-3">Click on a category name or color to edit. Press Enter to save, Escape to cancel.</p>
        </div>
        <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
          {categories.length === 0 ? (
            <div className="text-center py-4 text-slate-500 text-sm">
              No custom categories yet. Add one below!
            </div>
          ) : (
            categories.map(cat => (
              <div key={cat.id} className="flex items-center gap-3 p-2 bg-slate-700/30 rounded-lg border border-slate-600">
                <input
                  className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editingCategory?.id === cat.id ? editingCategory.name : cat.name}
                  onChange={e => {
                    const newName = e.target.value;
                    setEditingCategory(prev =>
                      prev?.id === cat.id
                        ? { ...prev, name: newName }
                        : { ...cat, name: newName }
                    );
                  }}
                  onFocus={() => {
                    if (editingCategory?.id !== cat.id) {
                      setEditingCategory(cat);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (editingCategory && editingCategory.id === cat.id && editingCategory.name !== cat.name) {
                        updateCategory(cat.id, { name: editingCategory.name });
                      }
                      setEditingCategory(null);
                    } else if (e.key === 'Escape') {
                      setEditingCategory(null);
                    }
                  }}
                  onBlur={() => {
                    if (editingCategory && editingCategory.id === cat.id && editingCategory.name !== cat.name) {
                      updateCategory(cat.id, { name: editingCategory.name });
                    }
                    setEditingCategory(null);
                  }}
                  placeholder="Category name"
                />
                <input
                  type="color"
                  className="w-8 h-8 p-0 border-none bg-transparent rounded cursor-pointer"
                  value={editingCategory?.id === cat.id ? editingCategory.color : cat.color}
                  onChange={e => {
                    const newColor = e.target.value;
                    setEditingCategory(prev =>
                      prev?.id === cat.id
                        ? { ...prev, color: newColor }
                        : { ...cat, color: newColor }
                    );
                  }}
                  onBlur={() => {
                    if (editingCategory && editingCategory.id === cat.id && editingCategory.color !== cat.color) {
                      updateCategory(cat.id, { color: editingCategory.color });
                    }
                    setEditingCategory(null);
                  }}
                  onFocus={() => {
                    if (editingCategory?.id !== cat.id) {
                      setEditingCategory(cat);
                    }
                  }}
                  title="Change color"
                />
                <button
                  onClick={() => deleteCategory(cat.id)}
                  className="text-red-400 hover:text-red-600 text-lg transition-colors p-1 rounded hover:bg-red-500/10"
                  title="Delete category"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-slate-600 pt-4">
          <h4 className="text-sm font-medium text-white mb-3">Add New Category</h4>
          <form
            onSubmit={async e => {
              e.preventDefault();
              if (!newCategoryName.trim()) return;
              try {
                await addCategory(newCategoryName.trim(), newCategoryColor);
                setNewCategoryName('');
                setNewCategoryColor('#3b82f6');
              } catch (error) {
                console.error('Failed to add category:', error);
              }
            }}
            className="space-y-3"
          >
            <div className="flex gap-2">
              <input
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Category name"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                required
                autoFocus
              />
              <input
                type="color"
                className="w-10 h-10 p-0 border-none bg-transparent rounded cursor-pointer"
                value={newCategoryColor}
                onChange={e => setNewCategoryColor(e.target.value)}
                title="Choose color"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-2 text-sm font-medium transition-colors"
              disabled={!newCategoryName.trim()}
            >
              Add Category
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function EmailInfoModal({ 
  user, 
  onClose 
}: { 
  user: User; 
  onClose: () => void;
}) {
  const taskEmail = `${user.uid}@sandboxc92822199c92457a8ed44bcb44760863.mailgun.org`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(taskEmail);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">📧 Email-to-Task</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <p className="text-slate-300 text-sm mb-2">
              Send emails to this address to automatically create tasks:
            </p>
            <div className="flex items-center gap-2">
              <code className="bg-slate-700 px-3 py-2 rounded text-sm text-blue-300 flex-1 break-all">
                {taskEmail}
              </code>
              <button
                onClick={copyToClipboard}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm transition"
              >
                Copy
              </button>
            </div>
          </div>
          
          <div className="bg-slate-700/50 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-2">Smart Features:</h3>
            <ul className="text-sm text-slate-300 space-y-1">
              <li>• <strong>Subject line</strong> becomes task title</li>
              <li>• <strong>Email body</strong> becomes task description</li>
              <li>• <strong>Due dates</strong> in subject (e.g., &ldquo;Meeting tomorrow&rdquo;)</li>
              <li>• <strong>Importance</strong> from keywords (URGENT, ASAP, etc.)</li>
              <li>• <strong>Auto-category</strong>: Inbox (grey)</li>
            </ul>
          </div>
          
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
            <p className="text-sm text-blue-300">
              <strong>Example:</strong> Send an email with subject &ldquo;Team Meeting URGENT&rdquo; 
              and it will create a high-priority task due soon!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthModal({ mode = 'signup', onClose }: { mode?: 'signin' | 'signup'; onClose: () => void }) {
  const { signInWithGoogle, signUpWithEmail, signInWithEmail, resetPassword, error, clearError } = useAuth();
  const [isSignUp, setIsSignUp] = useState(mode === 'signup');
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [recaptchaLoading, setRecaptchaLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearError();

    try {
      if (isResetPassword) {
        await resetPassword(email);
        alert('Password reset email sent! Check your inbox.');
        setIsResetPassword(false);
      } else if (isSignUp) {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }
        
        // Execute reCAPTCHA for signup
        await executeRecaptcha('SIGNUP');
      } else {
        // Execute reCAPTCHA for signin
        await executeRecaptcha('LOGIN');
      }
    } catch (err: unknown) {
      // Error is handled by the auth hook
      console.error('Authentication error:', err);
    } finally {
      setLoading(false);
    }
  };

  const executeRecaptcha = async (action: string) => {
    return new Promise<void>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.grecaptcha) {
        reject(new Error('Security verification not loaded. Please refresh the page and try again.'));
        return;
      }

      setRecaptchaLoading(true);

      window.grecaptcha.enterprise.ready(async () => {
        try {
          // Execute reCAPTCHA
          const token = await window.grecaptcha.enterprise.execute('6LczPKArAAAAAH2S3T1Jq0bbSVuaEmNnLsFeqeDf', { action });
          
          // Verify the token with our backend
          const verifyRecaptcha = httpsCallable(functions, 'verifyRecaptcha');
          await verifyRecaptcha({ token, action });
          
          // If verification succeeds, proceed with authentication
          if (isSignUp) {
            await signUpWithEmail(email, password, token);
          } else {
            await signInWithEmail(email, password, token);
          }
          
          setRecaptchaLoading(false);
          resolve();
        } catch (error) {
          setRecaptchaLoading(false);
          console.error('reCAPTCHA verification failed:', error);
          
          // Provide user-friendly error messages
          if (error instanceof Error) {
            if (error.message.includes('permission-denied')) {
              reject(new Error('Security verification failed. Please try again.'));
            } else if (error.message.includes('network')) {
              reject(new Error('Network error. Please check your connection and try again.'));
            } else {
              reject(new Error('Security verification failed. Please refresh the page and try again.'));
            }
          } else {
            reject(new Error('Security verification failed. Please try again.'));
          }
        }
      });
    });
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    clearError();
    try {
      await signInWithGoogle();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">
              {isResetPassword ? 'Reset Password' : (isSignUp ? 'Create Your Account' : 'Welcome Back')}
            </h2>
            <p className="text-sm text-slate-400">
              {isResetPassword 
                ? 'Enter your email to receive a password reset link' 
                : (isSignUp 
                  ? 'Join thousands of users organizing their tasks efficiently' 
                  : 'Sign in to access your task dashboard'
                )
              }
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white ml-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your email"
            />
          </div>

          {!isResetPassword && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your password"
              />
            </div>
          )}

          {isSignUp && !isResetPassword && (
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Confirm your password"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || recaptchaLoading}
            className={`w-full font-semibold py-3 px-4 rounded-lg transition-all duration-200 ${
              isSignUp 
                ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 shadow-lg hover:shadow-xl' 
                : 'bg-slate-600 hover:bg-slate-700 disabled:bg-slate-800'
            } text-white`}
          >
            {loading || recaptchaLoading ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {recaptchaLoading 
                  ? '🛡️ Verifying Security...' 
                  : (isSignUp ? 'Creating Account...' : 'Signing In...')
                }
              </div>
            ) : (
              isResetPassword ? '📧 Send Reset Email' : (isSignUp ? '🚀 Create My Account' : '👋 Sign Me In')
            )}
          </button>
        </form>

        {/* reCAPTCHA notice */}
        {!isResetPassword && (
          <div className="text-center mt-4 mb-2">
            <p className="text-xs text-slate-500">
              🛡️ Protected by reCAPTCHA Enterprise
            </p>
          </div>
        )}

        {!isResetPassword && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-800 text-slate-400">Or continue with</span>
              </div>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-white text-slate-800 font-semibold px-4 py-2 rounded-lg shadow hover:bg-blue-100 transition disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g clipPath="url(#clip0_17_40)">
                  <path d="M47.5 24.5C47.5 22.6 47.3 20.8 47 19H24V29H37.1C36.5 32.1 34.5 34.7 31.7 36.4V42H39.3C44 38.1 47.5 32.1 47.5 24.5Z" fill="#4285F4"/>
                  <path d="M24 48C30.6 48 36.1 45.9 39.3 42L31.7 36.4C29.9 37.6 27.7 38.3 24 38.3C18.7 38.3 14.1 34.7 12.5 29.9H4.7V35.7C7.9 42.1 15.3 48 24 48Z" fill="#34A853"/>
                  <path d="M12.5 29.9C12.1 28.7 11.9 27.4 11.9 26C11.9 24.6 12.1 23.3 12.5 22.1V16.3H4.7C3.2 19.1 2.5 22.4 2.5 26C2.5 29.6 3.2 32.9 4.7 35.7L12.5 29.9Z" fill="#FBBC05"/>
                  <path d="M24 9.7C27.1 9.7 29.5 10.8 31.2 12.3L39.4 4.1C36.1 1.1 30.6 0 24 0C15.3 0 7.9 5.9 4.7 16.3L12.5 22.1C14.1 17.3 18.7 13.7 24 13.7V9.7Z" fill="#EA4335"/>
                </g>
                <defs>
                  <clipPath id="clip0_17_40">
                    <rect width="48" height="48" fill="white"/>
                  </clipPath>
                </defs>
              </svg>
              Google
            </button>
          </>
        )}

        <div className="mt-6 text-center">
          {isResetPassword ? (
            <button
              onClick={() => {
                setIsResetPassword(false);
                setIsSignUp(false);
                clearError();
              }}
              className="text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              ← Back to Sign In
            </button>
          ) : (
            <div className="space-y-3">
              <div className="text-slate-500 text-xs">
                {isSignUp ? 'Already using Task Manager?' : 'New to Task Manager?'}
              </div>
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setIsResetPassword(false);
                  clearError();
                }}
                className={`text-sm font-medium transition-colors ${
                  isSignUp 
                    ? 'text-slate-300 hover:text-white' 
                    : 'text-blue-400 hover:text-blue-300'
                }`}
              >
                {isSignUp ? 'Sign In to Your Account' : '🚀 Create Free Account'}
              </button>
              {!isSignUp && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setIsResetPassword(true);
                      clearError();
                    }}
                    className="text-slate-400 hover:text-slate-300 text-xs"
                  >
                    Forgot your password?
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const {
    tasks,
    loading,
    createTask,
    updateTaskStatus,
    updateTask,
    deleteTask,
    filter,
    setFilter,
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useTasks();

  const { user, loading: authLoading, signOut } = useAuth();

  // Move this line to the top, before any useEffect that uses hoursPerDay
  const [hoursPerDay, setHoursPerDay] = useState(DEFAULT_HOURS_PER_DAY);
  const [hasLoadedHoursPerDay, setHasLoadedHoursPerDay] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signup');

  // Setup notifications when user is authenticated
  useEffect(() => {
    if (user && !authLoading) {
      const setupNotifications = async () => {
        // Request notification permission
        const permissionGranted = await notificationService.requestPermission();
        
        if (permissionGranted) {
          console.log('Notifications enabled');
          setNotificationsEnabled(true);
          
          // Setup FCM listener for foreground messages
          notificationService.setupFCMListener((payload) => {
            console.log('Foreground message received:', payload);
            // Handle foreground messages if needed
          });
          
          // Setup scheduled notifications
          notificationService.setupScheduledNotifications();
        } else {
          console.log('Notifications not enabled');
          setNotificationsEnabled(false);
        }
      };
      
      setupNotifications();
    }
  }, [user, authLoading]);

  // Load hoursPerDay from Firestore on login
  useEffect(() => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      getDoc(userRef).then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (typeof data.hoursPerDay === 'number') setHoursPerDay(data.hoursPerDay);
        }
        setHasLoadedHoursPerDay(true);
      });
    }
  }, [user]);

  // Save hoursPerDay to Firestore when it changes, but not on initial load
  useEffect(() => {
    if (user && hasLoadedHoursPerDay) {
      const userRef = doc(db, 'users', user.uid);
      setDoc(userRef, { hoursPerDay }, { merge: true });
    }
  }, [hoursPerDay, user, hasLoadedHoursPerDay]);

  // Form state
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<string>('personal');
  const [importance, setImportance] = useState(5);
  const [dueDate, setDueDate] = useState('');
  const [estTimeHrs, setEstTimeHrs] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'dateNoted' | 'importance' | 'dueDate'>('dateNoted');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Settings state
  // const [hoursPerDay, setHoursPerDay] = useState(DEFAULT_HOURS_PER_DAY); // This line is now redundant

  // Modal state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#3b82f6');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showEmailInfo, setShowEmailInfo] = useState(false);

  // Notification state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const handleEditTask = async (taskId: string, updates: Partial<Task>) => {
    if (!user) return;
    await updateTask(taskId, updates);
    
    // Update the selectedTask state if it's the task being edited
    if (selectedTask && selectedTask.id === taskId) {
      const updatedTask = { ...selectedTask, ...updates };
      setSelectedTask(updatedTask);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    try {
      await createTask({
        title: title.trim(),
        area,
        importance,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        estTimeHrs: estTimeHrs ? Number(estTimeHrs) : undefined,
        description: description.trim() ? description.trim() : undefined,
      });
      setTitle('');
      setDueDate('');
      setEstTimeHrs('');
      setImportance(5);
      setArea('personal');
      setDescription('');
    } finally {
      setAdding(false);
    }
  };

  const getAreaColor = (areaValue: TaskArea | string) => {
    // First check if it's a default area
    const defaultArea = AREA_OPTIONS.find(opt => opt.value === areaValue);
    if (defaultArea) return defaultArea.color;
    
    // Then check if it's a custom category
    const customCategory = categories.find(cat => cat.name === areaValue);
    if (customCategory) return customCategory.color;
    
    // Default fallback
    return '#6b7280';
  };

  // Filter and sort tasks
  const filteredAndSortedTasks = tasks
    .filter(task => {
      // Search filter
      if (searchTerm && !task.title.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Quadrant filter
      if (filter.quadrant) {
        const urgencyValue = calculateUrgency(task, hoursPerDay);
        const taskQuadrant = getQuadrant(task.importance, urgencyValue);
        if (taskQuadrant !== filter.quadrant) {
          return false;
        }
      }
      
      return true;
    })
    .sort((a, b) => {
      // First, prioritize open tasks over completed tasks
      if (a.status === 'complete' && b.status === 'open') {
        return 1; // Completed tasks go to the bottom
      }
      if (a.status === 'open' && b.status === 'complete') {
        return -1; // Open tasks stay at the top
      }
      
      // If both tasks have the same status, apply the normal sorting logic
      let aValue: number | Date, bValue: number | Date;
      
      switch (sortBy) {
        case 'importance':
          aValue = a.importance;
          bValue = b.importance;
          break;
        case 'dueDate':
          aValue = a.dueDate || new Date('9999-12-31');
          bValue = b.dueDate || new Date('9999-12-31');
          break;
        default: // dateNoted
          aValue = a.dateNoted;
          bValue = b.dateNoted;
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  // Task statistics
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(task => task.status === 'complete').length;
  const openTasks = totalTasks - completedTasks;

  // If auth is loading, show a loading spinner
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
          <span className="text-slate-300 text-lg">Loading...</span>
        </div>
      </div>
    );
  }

  // If not logged in, show improved landing page with clear auth options
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-8 flex flex-col items-center shadow-xl max-w-md w-full">
          {/* Logo/Icon */}
          <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-3 text-center">Task Manager</h1>
          <p className="text-slate-300 text-center mb-8 leading-relaxed">
            Organize your life across all areas with our powerful task management system featuring Eisenhower Matrix prioritization and smart notifications.
          </p>
          
          {/* Clear Action Buttons */}
          <div className="w-full space-y-3">
          <button
              onClick={() => {
                setAuthModalMode('signup');
                setShowAuthModal(true);
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl"
            >
              🚀 Create Free Account
            </button>
            
            <button
              onClick={() => {
                setAuthModalMode('signin');
                setShowAuthModal(true);
              }}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-6 rounded-lg border border-slate-600 transition-all duration-200"
            >
              Sign In to Existing Account
          </button>
        </div>
          
          {/* Features Preview */}
          <div className="mt-8 pt-6 border-t border-slate-600 w-full">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="text-slate-300">
                <div className="text-2xl mb-1">📊</div>
                <div className="text-xs font-medium">Eisenhower Matrix</div>
              </div>
              <div className="text-slate-300">
                <div className="text-2xl mb-1">📧</div>
                <div className="text-xs font-medium">Email to Task</div>
              </div>
              <div className="text-slate-300">
                <div className="text-2xl mb-1">🔔</div>
                <div className="text-xs font-medium">Smart Notifications</div>
              </div>
              <div className="text-slate-300">
                <div className="text-2xl mb-1">📱</div>
                <div className="text-xs font-medium">Mobile Friendly</div>
              </div>
            </div>
          </div>
        </div>
        {showAuthModal && <AuthModal mode={authModalMode} onClose={() => setShowAuthModal(false)} />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-800/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Task Manager</h1>
              <p className="text-slate-400 text-xs sm:text-sm">Organize your life across all areas</p>
            </div>
            
            {/* Quick Stats and Logout */}
            <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6">
              {/* Stats - Hidden on mobile, shown on tablet+ */}
              <div className="hidden sm:flex items-center gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-white">{totalTasks}</div>
                  <div className="text-xs text-slate-400">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-400">{openTasks}</div>
                  <div className="text-xs text-slate-400">Open</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-400">{completedTasks}</div>
                  <div className="text-xs text-slate-400">Done</div>
                </div>
              </div>
              
              {/* Hours per day setting */}
              <div className="text-center">
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(Number(e.target.value))}
                  className="w-10 sm:w-12 bg-slate-700/50 border border-slate-600 rounded px-1 py-0.5 text-white text-xs sm:text-sm text-center"
                />
                <div className="text-xs text-slate-400">h/day</div>
              </div>
              
              {/* User info and logout */}
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="text-center hidden sm:block">
                  <div className="text-sm sm:text-lg font-bold text-white truncate max-w-32">
                    {user.displayName || user.email}
                  </div>
                  <div className="text-xs text-slate-400">Account</div>
                </div>
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${notificationsEnabled ? 'bg-green-500' : 'bg-gray-400'}`} 
                       title={notificationsEnabled ? 'Notifications enabled' : 'Notifications disabled'} />
                  <span className="text-xs text-slate-400">
                    {notificationsEnabled ? '🔔' : '🔕'}
                  </span>
                </div>
                <button
                  onClick={() => setShowEmailInfo(true)}
                  className="px-2 sm:px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                  title="Email-to-Task Setup"
                >
                  📧
                </button>
                <button
                  onClick={signOut}
                  className="px-2 sm:px-3 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded text-xs font-medium transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
          
          {/* Mobile Stats Bar */}
          <div className="flex sm:hidden items-center justify-between mt-3 pt-3 border-t border-slate-600">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-sm font-bold text-white">{totalTasks}</div>
                <div className="text-xs text-slate-400">Total</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-blue-400">{openTasks}</div>
                <div className="text-xs text-slate-400">Open</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-green-400">{completedTasks}</div>
                <div className="text-xs text-slate-400">Done</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dashboard Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 min-h-[calc(100vh-140px)]">
          
          {/* Left Sidebar - Quick Add & Filters */}
          <div className="lg:col-span-3 space-y-4 sm:space-y-6">
            {/* Quick Add Task */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Quick Add</h3>
              <form onSubmit={handleAddTask} className="space-y-3">
                <input
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="What needs to be done?"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                />
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex gap-2 items-center">
                    <select
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      value={area}
                      onChange={e => setArea(e.target.value)}
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                      {AREA_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowCategoryModal(true)}
                      className="p-1 text-slate-400 hover:text-white transition-colors flex-shrink-0"
                      title="Manage Categories"
                    >
                      ⚙️
                    </button>
                  </div>
                  
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    value={importance}
                    onChange={e => setImportance(Number(e.target.value))}
                    placeholder="Imp"
                  />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                  />
                  
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    value={estTimeHrs}
                    onChange={e => setEstTimeHrs(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Hours"
                  />
                </div>
                
                <textarea
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="Description or comments (optional)"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  maxLength={300}
                />
                
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-lg px-4 py-2 transition-all duration-200 text-sm disabled:opacity-50"
                  disabled={adding}
                >
                  {adding ? 'Adding...' : 'Add Task'}
                </button>
              </form>
            </div>

            {/* Filters */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Filters</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Search</label>
                  <input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Area</label>
                    <select
                      value={filter.area || 'all'}
                      onChange={(e) => setFilter(prev => ({ ...prev, area: e.target.value === 'all' ? undefined : e.target.value }))}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="all">All Areas</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                      {AREA_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Status</label>
                    <select
                      value={filter.status || 'all'}
                      onChange={(e) => setFilter(prev => ({ ...prev, status: e.target.value === 'all' ? undefined : e.target.value as 'open' | 'complete' }))}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="all">All Status</option>
                      <option value="open">Open</option>
                      <option value="complete">Completed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Quadrant</label>
                  <select
                    value={filter.quadrant || 'all'}
                    onChange={(e) => setFilter(prev => ({ ...prev, quadrant: e.target.value === 'all' ? undefined : e.target.value as 'urgent-important' | 'important-not-urgent' | 'urgent-not-important' | 'not-urgent-not-important' }))}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="all">All Quadrants</option>
                    <option value="urgent-important">🔴 Urgent & Important</option>
                    <option value="important-not-urgent">🔵 Important, Not Urgent</option>
                    <option value="urgent-not-important">🟡 Urgent, Not Important</option>
                    <option value="not-urgent-not-important">⚪ Not Urgent, Not Important</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Sort</label>
                  <select
                    value={`${sortBy}-${sortOrder}`}
                    onChange={(e) => {
                      const [newSortBy, newSortOrder] = e.target.value.split('-');
                      setSortBy(newSortBy as 'dateNoted' | 'importance' | 'dueDate');
                      setSortOrder(newSortOrder as 'asc' | 'desc');
                    }}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="dateNoted-desc">Newest First</option>
                    <option value="importance-desc">Most Important</option>
                    <option value="dueDate-asc">Due Soon</option>
                  </select>
                </div>

                {(searchTerm || filter.area || filter.status || filter.quadrant) && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilter({});
                    }}
                    className="w-full text-slate-400 hover:text-white text-xs transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {/* Error Display - Hidden to prevent permissions error display */}
            {/* {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )} */}
          </div>

          {/* Center - Matrix & Calendar */}
          <div className="lg:col-span-5">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4 sm:p-6 h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold text-white">Eisenhower Matrix</h2>
                <div className="text-sm text-slate-400">
                  {filteredAndSortedTasks.filter(t => t.status === 'open').length} active tasks
                </div>
              </div>

              {/* Matrix Container */}
              <div className="flex-1 flex items-center justify-center">
                <div className="relative w-full max-w-xs sm:max-w-sm md:max-w-md h-48 sm:h-56 md:h-64 bg-slate-700/30 rounded-lg border border-slate-600">
                  {/* Axis Labels */}
                  <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-slate-400">
                    Urgency ←
                  </div>
                  <div className="absolute -left-12 top-1/2 transform -translate-y-1/2 -rotate-90 text-xs text-slate-400">
                    Importance →
                  </div>
                  
                  {/* Grid Lines */}
                  <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                    <div className="border-r border-b border-slate-600"></div>
                    <div className="border-b border-slate-600"></div>
                    <div className="border-r border-slate-600"></div>
                    <div></div>
                  </div>
                  
                  {/* Quadrant Labels - Correct Eisenhower Matrix positioning */}
                  <div className="absolute top-2 left-2 text-xs font-medium text-red-400">Urgent & Important</div>
                  <div className="absolute top-2 right-2 text-xs font-medium text-blue-400">Important, Not Urgent</div>
                  <div className="absolute bottom-2 left-2 text-xs font-medium text-yellow-400">Urgent, Not Important</div>
                  <div className="absolute bottom-2 right-2 text-xs font-medium text-slate-400">Not Urgent, Not Important</div>
                  
                  {/* Task Dots */}
                  {(() => {
                    const openTasks = filteredAndSortedTasks.filter(task => task.status === 'open');
                    const dotPositions: Array<{x: number, y: number, task: Task}> = [];
                    
                    openTasks.forEach(task => {
                      // Calculate importance position (1-10 scale mapped to 0-1, then to pixel position)
                      const importanceNormalized = (task.importance - 1) / 9; // 0-1 scale
                      
                      // Calculate urgency using the proper Excel formula
                      const urgencyValue = calculateUrgency(task, hoursPerDay);
                      const urgencyNormalized = (urgencyValue - 1) / 9; // 0-1 scale
                      
                      // Map to pixel coordinates (responsive)
                      // X-axis: urgency (left = high, right = low)
                      // Y-axis: importance (top = high, bottom = low)
                      // Use percentage-based positioning for responsive behavior
                      const padding = 12; // 12px padding from container edges
                      const availableWidth = 100 - (padding * 2); // Percentage of container width
                      const availableHeight = 100 - (padding * 2); // Percentage of container height
                      
                      // Convert normalized values to percentages
                      // Urgency: 0-1 scale, where 0 = low urgency (right), 1 = high urgency (left)
                      // Importance: 0-1 scale, where 0 = low importance (bottom), 1 = high importance (top)
                      const xPercent = padding + ((1 - urgencyNormalized) * availableWidth);
                      const yPercent = padding + ((1 - importanceNormalized) * availableHeight);
                      
                      // Convert percentages to pixels (assuming container is positioned relatively)
                      // These will be used as left/top values in percentage
                      let x = xPercent;
                      let y = yPercent;
                      
                      // Collision detection and resolution
                      const minSpacing = 4; // Minimum spacing between dots (in percentage)
                      let attempts = 0;
                      const maxAttempts = 20;
                      
                      while (attempts < maxAttempts) {
                        let hasCollision = false;
                        
                        for (const existing of dotPositions) {
                          const distance = Math.sqrt(
                            Math.pow(x - existing.x, 2) + Math.pow(y - existing.y, 2)
                          );
                          
                          if (distance < minSpacing) { // Minimum spacing between dots
                            hasCollision = true;
                            break;
                          }
                        }
                        
                        if (!hasCollision) {
                          break;
                        }
                        
                        // Gentle spiral pattern that stays close to original position
                        const angle = (attempts * 0.8) * Math.PI;
                        const radius = (attempts * 1.2) + minSpacing;
                        const offsetX = Math.cos(angle) * radius;
                        const offsetY = Math.sin(angle) * radius;
                        
                        // Apply small offset to stay close to natural position
                        x = Math.max(padding, Math.min(100 - padding, xPercent + offsetX));
                        y = Math.max(padding, Math.min(100 - padding, yPercent + offsetY));
                        
                        attempts++;
                      }
                      
                      dotPositions.push({x, y, task});
                    });
                    
                    return dotPositions.map(({x, y, task}) => {
                      const urgencyValue = calculateUrgency(task, hoursPerDay);
                      return (
                        <div
                          key={task.id}
                          className="absolute w-3 h-3 rounded-full cursor-pointer transition-all hover:scale-125 hover:z-10 hover:ring-2 hover:ring-white/50"
                          style={{
                            left: `${x}%`,
                            top: `${y}%`,
                            backgroundColor: getAreaColor(task.area),
                            transform: 'translate(-50%, -50%)'
                          }}
                          title={`${task.title} (${task.area})\nImportance: ${task.importance}/10\nUrgency: ${urgencyValue}/10${task.dueDate ? `\nDue: ${new Date(task.dueDate).toLocaleDateString()}` : ''}${task.estTimeHrs ? `\nEst. Time: ${task.estTimeHrs}h` : ''}\n\nClick to see details`}
                          onClick={() => setSelectedTask(task)}
                        />
                      );
                    });
                  })()}
                </div>
              </div>
              
              {/* Calendar Workload */}
              <CalendarWorkload 
                tasks={tasks} 
                hoursPerDay={hoursPerDay} 
                onDayClick={(date) => setSelectedDate(date)}
              />
              
              {/* Matrix Legend */}
              <div className="mt-4 text-xs text-slate-400">
                <div className="flex flex-wrap justify-center gap-2 sm:gap-4">
                  {AREA_OPTIONS.map(opt => (
                    <div key={opt.value} className="flex items-center gap-1">
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: opt.color }}
                      />
                      <span className="text-xs">{opt.label}</span>
                    </div>
                  ))}
                </div>
                <div className="text-center mt-2 text-slate-500">
                  Urgency calculated based on workload vs available time
                </div>
                <div className="text-center mt-1 text-slate-500">
                  Click dots or task cards to see details
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Tasks List */}
          <div className="lg:col-span-4">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4 sm:p-6 h-full flex flex-col min-h-[500px] lg:h-[calc(100vh-140px)]">
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h2 className="text-xl font-semibold text-white">
                  Tasks ({filteredAndSortedTasks.length})
                </h2>
                <div className="text-sm text-slate-400">
                  {openTasks} open, {completedTasks} completed
                </div>
              </div>

              {/* Tasks List with Scroll */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                    <span className="ml-3 text-slate-400 text-sm">Loading tasks...</span>
                  </div>
                )}
                
                {filteredAndSortedTasks.map(task => {
                  return (
                    <div 
                      key={task.id} 
                      className={`bg-slate-700/30 backdrop-blur-sm border border-slate-600 rounded-lg p-4 transition-all hover:shadow-lg cursor-pointer ${
                        task.status === 'complete' ? 'opacity-75' : ''
                      }`}
                      onClick={() => setSelectedTask(task)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                            <h3 className={`text-sm font-semibold truncate flex-1 min-w-0 max-w-[280px] sm:max-w-[400px] ${
                              task.status === 'complete' ? 'text-slate-500 line-through' : 'text-white'
                            }`}>
                              {task.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-0.5 sm:gap-1 flex-shrink">
                              <span 
                                className="px-1.5 py-0.5 text-xs font-medium rounded-full text-white flex-shrink-0 min-w-[40px] max-w-[60px] text-center"
                                style={{ backgroundColor: getAreaColor(task.area) }}
                              >
                                {task.area}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex gap-4 text-slate-400 text-xs">
                            {task.dueDate && (
                              <span>
                                Due: {new Date(task.dueDate).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric' 
                                })}
                              </span>
                            )}
                            {task.estTimeHrs && (
                              <span>Est: {task.estTimeHrs}h</span>
                            )}
                          </div>
                          {task.description && (
                            <div className="text-xs text-slate-400 mt-0.5 truncate max-w-full">
                              {task.description.slice(0, 60)}{task.description.length > 60 ? '…' : ''}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-1 sm:gap-2 ml-2 sm:ml-3 flex-shrink-0">
                          {task.status !== 'complete' && (
                            <button
                              className="px-2 sm:px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTaskStatus(task.id, 'complete');
                              }}
                            >
                              ✓
                            </button>
                          )}
                          <button
                            className="px-2 sm:px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTask(task.id);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {filteredAndSortedTasks.length === 0 && !loading && (
                  <div className="text-center py-8">
                    <div className="text-slate-400 text-sm mb-1">No tasks found</div>
                    <p className="text-slate-500 text-xs">Add a task to get started!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          urgencyValue={calculateUrgency(selectedTask, hoursPerDay)}
          onClose={() => setSelectedTask(null)}
          onEdit={(task) => setEditingTask(task)}
        />
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={handleEditTask}
          categories={categories}
        />
      )}

      {showCategoryModal && (
        <CategoryModal
          categories={categories}
          addCategory={addCategory}
          updateCategory={updateCategory}
          deleteCategory={deleteCategory}
          editingCategory={editingCategory}
          setEditingCategory={setEditingCategory}
          newCategoryName={newCategoryName}
          setNewCategoryName={setNewCategoryName}
          newCategoryColor={newCategoryColor}
          setNewCategoryColor={setNewCategoryColor}
          setShowCategoryModal={setShowCategoryModal}
        />
      )}

      {/* Daily Tasks Modal */}
      {selectedDate && (
        <DailyTasksModal
          date={selectedDate}
          tasks={tasks}
          onClose={() => setSelectedDate(null)}
          onViewTask={(task) => {
            setSelectedDate(null); // Close the daily tasks modal
            setSelectedTask(task); // Open the task detail modal
          }}
        />
      )}

      {/* Email Info Modal */}
      {showEmailInfo && user && (
        <EmailInfoModal
          user={user}
          onClose={() => setShowEmailInfo(false)}
        />
      )}
    </div>
  );
}
