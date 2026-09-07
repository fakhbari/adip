"use client";

import React, {useState} from 'react';
import {Card, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription, DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Plus} from "lucide-react";
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {RulesSourceType} from "@/app/types/types";

const RulesTab = () => {
    const [isAddRulesOpen, setIsAddRulesOpen] = useState(false);

    const [newRule, setNewRule] = useState({
        name: "",
        type: RulesSourceType.GitLab,
        ruleUrl: "",
        ruleFile:null
    });

    const [showUploadFile , setShowUploadFile] = useState(false)

    const handleAddRule = async () => {
        // add logic after backend is ready
        console.log(newRule)
    };
    const handleSelectChange = (value) =>{
        setNewRule({ ...newRule, type: value })
        if(value === RulesSourceType.PDF){
            setShowUploadFile(true)
        }else {
            setShowUploadFile(false)
        }
    }

    return (

        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Rules</CardTitle>
                        <CardDescription>
                            Add rules to check projects base on them
                        </CardDescription>
                    </div>
                    <Dialog open={isAddRulesOpen} onOpenChange={setIsAddRulesOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Rule
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add Rule</DialogTitle>
                                <DialogDescription>
                                    Add PDF or respository url
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Rule Name</Label>
                                    <Input
                                        value={newRule.name}
                                        onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                                        placeholder="e.g., Internal GitLab"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Type</Label>
                                    <Select
                                        value={newRule.type}
                                        onValueChange={handleSelectChange}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={RulesSourceType.GitLab}>{RulesSourceType.GitLab}</SelectItem>
                                            <SelectItem value={RulesSourceType.GitHub}>{RulesSourceType.GitHub}</SelectItem>
                                            <SelectItem value={RulesSourceType.BitBucket}>{RulesSourceType.BitBucket}</SelectItem>
                                            <SelectItem value={RulesSourceType.PDF}>{RulesSourceType.PDF}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    {showUploadFile
                                        ? (<div className="space-y-2">
                                            <Label>Upload PDF file</Label>
                                            <input type="file"
                                                   onChange={(e) => setNewRule({ ...newRule , ruleFile: e.target.files[0] ,ruleUrl:"" })}
                                                   className="block w-full text-sm text-gray-500 file:me-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-300 file:text-gray-700 hover:file:bg-gray-500"/>
                                            </div>)
                                        : (<div className="space-y-2">
                                            <Label>Server URL</Label>
                                            <Input
                                                value={newRule.url}
                                                onChange={(e) => setNewRule({ ...newRule, ruleUrl: e.target.value , ruleFile: null })}
                                                placeholder="https://gitlab.company.com"
                                            />
                                        </div>)}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddRulesOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleAddRule}>Add Rule</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
        </Card>
    );
};

export default RulesTab;