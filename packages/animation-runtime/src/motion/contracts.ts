import {z} from 'zod';
import {sceneTimelineSchema} from '../scene';
import {
  semanticRoles,
  jointConstraintSchema,
  semanticRoleSchema,
  poseSchema,
  secondaryMotionSchema,
} from './pose-contracts';
export * from './pose-contracts';
const number = z.number().finite();
const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
export const pointSchema = z.object({x: number, y: number}).strict();
export const roles = semanticRoles;
export const semanticRigSchema = z
  .object(
    Object.fromEntries(roles.map((role) => [role, id.optional()])) as Record<
      (typeof roles)[number],
      z.ZodOptional<typeof id>
    >,
  )
  .strict();
const common = {
  id,
  target: id,
  start: number.min(0),
  duration: number.positive(),
  dependencies: z.array(id).default([]),
  easing: z
    .enum(['linear', 'easeIn', 'easeOut', 'easeInOut'])
    .default('easeInOut'),
};
export const motionActionSchema = z.discriminatedUnion('type', [
  z.object({...common, type: z.literal('pose'), pose: id}).strict(),
  z
    .object({
      ...common,
      type: z.literal('walk'),
      to: pointSchema,
      amplitude: number.min(0).max(80).default(25),
      cycles: z.number().int().positive().max(100).default(2),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('sit'),
      to: pointSchema,
      amplitude: number.min(0).max(120).default(80),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('reach'),
      to: pointSchema,
      bend: z
        .union([z.literal(1), z.literal(-1), z.literal('auto')])
        .default('auto'),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('pickUp'),
      object: id,
      contact: pointSchema,
      bend: z
        .union([z.literal(1), z.literal(-1), z.literal('auto')])
        .default('auto'),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('putDown'),
      object: id,
      to: pointSchema,
      bend: z
        .union([z.literal(1), z.literal(-1), z.literal('auto')])
        .default('auto'),
    })
    .strict(),
]);
export const motionPlanSchema = z
  .object({
    version: z.literal('1.0'),
    fps: sceneTimelineSchema.shape.fps,
    duration: sceneTimelineSchema.shape.duration,
    rigs: z.record(id, semanticRigSchema),
    actions: z.array(motionActionSchema).min(1),
    tracks: sceneTimelineSchema.shape.tracks.optional(),
    constraints: z
      .record(id, z.partialRecord(semanticRoleSchema, jointConstraintSchema))
      .optional(),
    poses: z.record(id, poseSchema).optional(),
    secondary: z.array(secondaryMotionSchema).optional(),
  })
  .strict();
export type MotionPlan = z.infer<typeof motionPlanSchema>;
export type MotionAction = z.infer<typeof motionActionSchema>;
export type SemanticRig = z.infer<typeof semanticRigSchema>;
