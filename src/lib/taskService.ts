/* eslint-disable @typescript-eslint/no-explicit-any */
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { Task, CreateTaskData, TaskArea, TaskStatus, Category } from '../types/task';

// Convert Firestore timestamp to Date
const timestampToDate = (timestamp: Timestamp | Date): Date => {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }
  return timestamp;
};

// Convert Date to Firestore timestamp
const dateToTimestamp = (date: Date | undefined): Timestamp | undefined => {
  if (!date) return undefined;
  return Timestamp.fromDate(date);
};

// Convert Task from Firestore format
const fromFirestore = (doc: any): Task => {
  const data = doc.data();
  return {
    id: doc.id,
    title: data.title,
    description: data.description || undefined,
    area: data.area,
    dateNoted: timestampToDate(data.dateNoted),
    dueDate: data.dueDate ? timestampToDate(data.dueDate) : undefined,
    estTimeHrs: data.estTimeHrs || undefined,
    realTimeHrs: data.realTimeHrs || undefined,
    importance: data.importance,
    priorityScore: data.priorityScore || undefined,
    status: data.status,
    recurrence: data.recurrence || 'none',
    interval: data.interval || undefined,
    weekdays: data.weekdays || undefined,
    nextDate: data.nextDate ? timestampToDate(data.nextDate) : undefined,
  };
};

// Convert Task to Firestore format
const toFirestore = (task: CreateTaskData): Record<string, unknown> => {
  const firestoreData: any = {
    title: task.title,
    area: task.area,
    dateNoted: Timestamp.now(),
    importance: task.importance,
    status: 'open' as TaskStatus,
    recurrence: task.recurrence || 'none',
  };

  // Only add fields that have values (not undefined)
  if (task.description) firestoreData.description = task.description;
  if (task.dueDate) firestoreData.dueDate = dateToTimestamp(task.dueDate);
  if (task.estTimeHrs) firestoreData.estTimeHrs = task.estTimeHrs;
  if (task.interval) firestoreData.interval = task.interval;
  if (task.weekdays) firestoreData.weekdays = task.weekdays;

  return firestoreData;
};

function userTasksCollection(uid: string) {
  return collection(db, 'users', uid, 'tasks');
}

function userTaskDoc(uid: string, taskId: string) {
  return doc(db, 'users', uid, 'tasks', taskId);
}

function userCategoriesCollection(uid: string) {
  return collection(db, 'users', uid, 'categories');
}

function userCategoryDoc(uid: string, categoryId: string) {
  return doc(db, 'users', uid, 'categories', categoryId);
}

export const taskService = {
  // Create a new task
  async createTask(uid: string, taskData: CreateTaskData): Promise<Task> {
    const docRef = await addDoc(userTasksCollection(uid), toFirestore(taskData));
    return {
      id: docRef.id,
      ...taskData,
      dateNoted: new Date(),
      realTimeHrs: undefined,
      priorityScore: undefined,
      status: 'open',
      recurrence: taskData.recurrence || 'none',
      interval: taskData.interval,
      weekdays: taskData.weekdays,
      nextDate: undefined,
    };
  },

  // Get all tasks
  async getTasks(uid: string): Promise<Task[]> {
    const q = query(
      userTasksCollection(uid),
      orderBy('dateNoted', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(fromFirestore);
  },

  // Get tasks by area
  async getTasksByArea(uid: string, area: TaskArea): Promise<Task[]> {
    const q = query(
      userTasksCollection(uid),
      where('area', '==', area),
      orderBy('dateNoted', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(fromFirestore);
  },

  // Get tasks by status
  async getTasksByStatus(uid: string, status: TaskStatus): Promise<Task[]> {
    const q = query(
      userTasksCollection(uid),
      where('status', '==', status),
      orderBy('dateNoted', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(fromFirestore);
  },

  // Update task status
  async updateTaskStatus(uid: string, taskId: string, status: TaskStatus): Promise<void> {
    const taskRef = userTaskDoc(uid, taskId);
    await updateDoc(taskRef, { status });
  },

  // Update task
  async updateTask(uid: string, taskId: string, updates: Partial<Task>): Promise<void> {
    const taskRef = userTaskDoc(uid, taskId);
    const firestoreUpdates: any = {};
    
    if (updates.title !== undefined) firestoreUpdates.title = updates.title;
    if (updates.description !== undefined) firestoreUpdates.description = updates.description;
    if (updates.area !== undefined) firestoreUpdates.area = updates.area;
    if (updates.dueDate !== undefined) firestoreUpdates.dueDate = dateToTimestamp(updates.dueDate);
    if (updates.estTimeHrs !== undefined) firestoreUpdates.estTimeHrs = updates.estTimeHrs;
    if (updates.realTimeHrs !== undefined) firestoreUpdates.realTimeHrs = updates.realTimeHrs;
    if (updates.importance !== undefined) firestoreUpdates.importance = updates.importance;
    if (updates.priorityScore !== undefined) firestoreUpdates.priorityScore = updates.priorityScore;
    if (updates.status !== undefined) firestoreUpdates.status = updates.status;
    if (updates.recurrence !== undefined) firestoreUpdates.recurrence = updates.recurrence;
    if (updates.interval !== undefined) firestoreUpdates.interval = updates.interval;
    if (updates.weekdays !== undefined) firestoreUpdates.weekdays = updates.weekdays;
    if (updates.nextDate !== undefined) firestoreUpdates.nextDate = dateToTimestamp(updates.nextDate);

    await updateDoc(taskRef, firestoreUpdates);
  },

  // Delete task
  async deleteTask(uid: string, taskId: string): Promise<void> {
    const taskRef = userTaskDoc(uid, taskId);
    await deleteDoc(taskRef);
  },

  // CATEGORY METHODS
  async getCategories(uid: string): Promise<Category[]> {
    const q = query(userCategoriesCollection(uid));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
  },

  async addCategory(uid: string, name: string, color: string): Promise<Category> {
    const docRef = await addDoc(userCategoriesCollection(uid), { name, color });
    return { id: docRef.id, name, color };
  },

  async updateCategory(uid: string, categoryId: string, updates: Partial<Category>): Promise<void> {
    const catRef = userCategoryDoc(uid, categoryId);
    await updateDoc(catRef, updates);
  },

  async deleteCategory(uid: string, categoryId: string): Promise<void> {
    const catRef = userCategoryDoc(uid, categoryId);
    await deleteDoc(catRef);
  },
}; 