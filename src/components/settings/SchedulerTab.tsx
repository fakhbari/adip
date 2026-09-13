import React from 'react';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Switch} from "@/components/ui/switch";
import {Button} from "@/components/ui/button";
import {Edit} from "lucide-react";

const SchedulerTab = (props) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Schedule Configuration</CardTitle>
                <CardDescription>
                    Configure automated documentation generation schedules
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {props.data?.schedules.map((schedule) => (
                        <div
                            key={schedule.id}
                            className="flex items-center justify-between p-4 rounded-lg border"
                        >
                            <div className="flex items-center gap-4">
                                <Switch checked={schedule.isActive} />
                                <div>
                                    <p className="font-medium">{schedule.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                        Cron: {schedule.cronExpression}
                                    </p>
                                    {schedule.nextRun && (
                                        <p className="text-xs text-muted-foreground">
                                            Next run: {new Date(schedule.nextRun).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm">
                                    <Edit className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export default SchedulerTab;