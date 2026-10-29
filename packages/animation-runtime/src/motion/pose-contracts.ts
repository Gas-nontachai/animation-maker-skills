import {z} from 'zod';
export const semanticRoles = ['torso', 'upperArm', 'forearm', 'hand', 'otherUpperArm', 'leftThigh', 'rightThigh', 'leftLowerLeg', 'rightLowerLeg', 'head'] as const;
export const semanticRoleSchema = z.enum(semanticRoles);
const angle = z.number().finite();
export const jointConstraintSchema = z.object({min: angle, max: angle, preferred: angle.optional(), stability: angle.min(0).optional()}).strict().superRefine((rule,ctx)=>{
  if(rule.min>rule.max)ctx.addIssue({code:'custom',message:'joint min exceeds max'});
  if(rule.preferred!==undefined&&(rule.preferred<rule.min||rule.preferred>rule.max))ctx.addIssue({code:'custom',message:'preferred angle outside joint limits'});
});
export const semanticAnglesSchema = z.partialRecord(semanticRoleSchema,angle);
export const poseSchema = z.object({joints:semanticAnglesSchema,preferred:semanticAnglesSchema.optional()}).strict().superRefine((pose,ctx)=>{
  if(!Object.keys(pose.joints).length)ctx.addIssue({code:'custom',message:'pose needs at least one joint target'});
  for(const role of semanticRoles)if(pose.joints[role]!==undefined&&pose.preferred?.[role]!==undefined&&pose.joints[role]!==pose.preferred[role])ctx.addIssue({code:'custom',path:['preferred',role],message:'preferred configuration conflicts with explicit joint target'});
});
export const secondaryMotionSchema = z.object({target:z.string().regex(/^[a-zA-Z0-9_-]+$/),joint:z.enum(['torso','head']),start:angle.min(0),duration:angle.positive(),intensity:angle.min(0).max(1).default(0),amplitude:angle.min(0).max(5).default(2),cycles:z.number().int().min(1).max(20).default(1)}).strict();
export type JointConstraint = z.infer<typeof jointConstraintSchema>;
