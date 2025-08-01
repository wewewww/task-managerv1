"use client";

import { useState, useEffect, useCallback } from 'react';
import { Task, CreateTaskData, TaskArea, TaskStatus, Category } from '../types/task';
import { taskService } from '../lib/taskService';
import { useAuth } from './useAuth';
import { notificationService } from '../lib/notificationService';

export const useTasks = () => {
  const { user } = useAuth();
  const uid = user?.uid;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{
    area?: TaskArea | string;
    status?: TaskStatus;
    quadrant?: 'urgent-important' | 'important-not-urgent' | 'urgent-not-important' | 'not-urgent-not-important';
  }>({});

  // Load tasks
  const loadTasks = useCallback(async () => {
    if (!uid) return;
    try {
      setLoading(true);
      setError(null);
      const fetchedTasks = await taskService.getTasks(uid);
      setTasks(fetchedTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  // Load categories
  const loadCategories = useCallback(async () => {
    if (!uid) return;
    try {
      const fetchedCategories = await taskService.getCategories(uid);
      setCategories(fetchedCategories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    }
  }, [uid]);

  // Load tasks and categories on mount or when uid changes
  useEffect(() => {
    if (uid) {
      loadTasks();
      loadCategories();
    } else {
      setTasks([]);
      setCategories([]);
    }
  }, [loadTasks, loadCategories, uid]);

  // Create task
  const createTask = useCallback(async (taskData: CreateTaskData) => {
    if (!uid) throw new Error('User not authenticated');
    try {
      setError(null);
      const newTask = await taskService.createTask(uid, taskData);
      setTasks(prev => [newTask, ...prev]);
      
      // Send notification for new task if it's due soon
      await notificationService.notifyTaskCreated(newTask);
      
      return newTask;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
      throw err;
    }
  }, [uid]);

  // Update task status
  const updateTaskStatus = useCallback(async (taskId: string, status: TaskStatus) => {
    if (!uid) throw new Error('User not authenticated');
    try {
      setError(null);
      await taskService.updateTaskStatus(uid, taskId, status);
      setTasks(prev => 
        prev.map(task => 
          task.id === taskId ? { ...task, status } : task
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task status');
      throw err;
    }
  }, [uid]);

  // Update task
  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    if (!uid) throw new Error('User not authenticated');
    try {
      setError(null);
      await taskService.updateTask(uid, taskId, updates);
      setTasks(prev => 
        prev.map(task => 
          task.id === taskId ? { ...task, ...updates } : task
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
      throw err;
    }
  }, [uid]);

  // Delete task
  const deleteTask = useCallback(async (taskId: string) => {
    if (!uid) throw new Error('User not authenticated');
    try {
      setError(null);
      await taskService.deleteTask(uid, taskId);
      setTasks(prev => prev.filter(task => task.id !== taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task');
      throw err;
    }
  }, [uid]);

  // Category management
  const addCategory = useCallback(async (name: string, color: string) => {
    if (!uid) throw new Error('User not authenticated');
    try {
      const newCat = await taskService.addCategory(uid, name, color);
      setCategories(prev => [...prev, newCat]);
      return newCat;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add category');
      throw err;
    }
  }, [uid]);

  const updateCategory = useCallback(async (categoryId: string, updates: Partial<Category>) => {
    if (!uid) throw new Error('User not authenticated');
    try {
      await taskService.updateCategory(uid, categoryId, updates);
      setCategories(prev => prev.map(cat => cat.id === categoryId ? { ...cat, ...updates } : cat));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category');
      throw err;
    }
  }, [uid]);

  const deleteCategory = useCallback(async (categoryId: string) => {
    if (!uid) throw new Error('User not authenticated');
    try {
      await taskService.deleteCategory(uid, categoryId);
      setCategories(prev => prev.filter(cat => cat.id !== categoryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
      throw err;
    }
  }, [uid]);

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    if (filter.area && task.area !== filter.area) return false;
    if (filter.status && task.status !== filter.status) return false;
    return true;
  });

  return {
    tasks: filteredTasks,
    allTasks: tasks,
    categories,
    loading,
    error,
    createTask,
    updateTaskStatus,
    updateTask,
    deleteTask,
    loadTasks,
    filter,
    setFilter,
    addCategory,
    updateCategory,
    deleteCategory,
    loadCategories,
  };
}; 