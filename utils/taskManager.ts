/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type TaskType = "NUKE" | "DM_CLEAR" | "PACKAGE_CLEAR" | "FOLLOW_PULL" | "SPAM";
export type TaskStatus = "RUNNING" | "PAUSED" | "COMPLETED" | "ERROR" | "STOPPED";

export interface TaskMetrics {
    deleted: number;
    total: number;
    failed: number;
    startTime: number;
    currentSpeed: number; // messages per minute
    averageSpeed: number; // messages per minute
    estimatedTimeRemaining: number; // seconds
    rateLimitHits: number;
    lastUpdateTime: number;
    recentDeletes: number[]; // Timestamps of last 10 deletes for speed calculation
}

export interface ActiveTask {
    id: string;
    type: TaskType;
    description: string;
    status: TaskStatus;
    progress: string;
    timestamp: number;
    metadata?: any;
    metrics?: TaskMetrics;
    actions: {
        pause: () => void;
        resume: () => void;
        stop: () => void;
    };
}

type Listener = (tasks: ActiveTask[]) => void;

class TaskManager {
    private tasks: Map<string, ActiveTask> = new Map();
    private listeners: Set<Listener> = new Set();

    constructor() { }

    public registerTask(task: ActiveTask) {
        this.tasks.set(task.id, task);
        this.notifyListeners();
        return task.id;
    }

    public updateTask(id: string, updates: Partial<ActiveTask>) {
        const task = this.tasks.get(id);
        if (task) {
            this.tasks.set(id, { ...task, ...updates });
            this.notifyListeners();
        }
    }

    public updateMetrics(id: string, metricsUpdate: Partial<TaskMetrics>) {
        const task = this.tasks.get(id);
        if (task) {
            const currentMetrics = task.metrics || createDefaultMetrics();
            const newMetrics = { ...currentMetrics, ...metricsUpdate };

            // Calculate speeds
            const now = Date.now();
            const elapsedMinutes = (now - newMetrics.startTime) / 60000;

            if (elapsedMinutes > 0 && newMetrics.deleted > 0) {
                newMetrics.averageSpeed = Math.round(newMetrics.deleted / elapsedMinutes);
            }

            // Calculate current speed from recent deletes
            const recentDeletes = newMetrics.recentDeletes || [];
            if (recentDeletes.length >= 2) {
                const recentTimeSpan = (recentDeletes[recentDeletes.length - 1] - recentDeletes[0]) / 60000;
                if (recentTimeSpan > 0) {
                    newMetrics.currentSpeed = Math.round((recentDeletes.length - 1) / recentTimeSpan);
                }
            }

            // Estimate remaining time
            const remaining = newMetrics.total - newMetrics.deleted;
            if (newMetrics.currentSpeed > 0) {
                newMetrics.estimatedTimeRemaining = Math.round((remaining / newMetrics.currentSpeed) * 60);
            } else if (newMetrics.averageSpeed > 0) {
                newMetrics.estimatedTimeRemaining = Math.round((remaining / newMetrics.averageSpeed) * 60);
            }

            newMetrics.lastUpdateTime = now;

            this.tasks.set(id, { ...task, metrics: newMetrics });
            this.notifyListeners();
        }
    }

    public recordDelete(id: string) {
        const task = this.tasks.get(id);
        if (task && task.metrics) {
            const recentDeletes = [...(task.metrics.recentDeletes || []), Date.now()];
            // Keep only last 20 timestamps
            if (recentDeletes.length > 20) {
                recentDeletes.shift();
            }
            this.updateMetrics(id, {
                deleted: task.metrics.deleted + 1,
                recentDeletes
            });
        }
    }

    public recordRateLimit(id: string) {
        const task = this.tasks.get(id);
        if (task && task.metrics) {
            this.updateMetrics(id, {
                rateLimitHits: task.metrics.rateLimitHits + 1
            });
        }
    }

    public removeTask(id: string) {
        if (this.tasks.has(id)) {
            this.tasks.delete(id);
            this.notifyListeners();
        }
    }

    public getTasks(): ActiveTask[] {
        return Array.from(this.tasks.values()).sort((a, b) => b.timestamp - a.timestamp);
    }

    public subscribe(listener: Listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners() {
        const tasks = this.getTasks();
        this.listeners.forEach(l => l(tasks));
    }
}

export function createDefaultMetrics(): TaskMetrics {
    return {
        deleted: 0,
        total: 0,
        failed: 0,
        startTime: Date.now(),
        currentSpeed: 0,
        averageSpeed: 0,
        estimatedTimeRemaining: 0,
        rateLimitHits: 0,
        lastUpdateTime: Date.now(),
        recentDeletes: []
    };
}

export function formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return "Calculating...";
    if (seconds < 60) return `~${seconds}s`;
    if (seconds < 3600) return `~${Math.round(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `~${hours}h ${mins}m`;
}

export const taskManager = new TaskManager();
