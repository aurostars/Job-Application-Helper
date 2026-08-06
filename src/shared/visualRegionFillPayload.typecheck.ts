import type {
  VisualRegionFillPayload,
  VisualRegionFillRequestPayload,
} from './types.ts';

const sharedFields = {
  requestId: 'req-1',
  domain: 'jobs.bytedance.com',
  controls: [],
  region: {
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  },
};

const requestPayload: VisualRegionFillRequestPayload = sharedFields;
const strictPayload: VisualRegionFillPayload = {
  ...sharedFields,
  image: {
    base64: 'ZmFrZQ==',
    mimeType: 'image/png',
    width: 10,
    height: 10,
  },
};

// @ts-expect-error VisualRegionFillPayload 必须保持严格有图
const invalidStrictPayload: VisualRegionFillPayload = sharedFields;

void requestPayload;
void strictPayload;
void invalidStrictPayload;
