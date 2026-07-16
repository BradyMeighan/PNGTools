# Local AI model manifest

The application downloads these static model files only when the matching AI tool is first used. Browser Cache Storage keeps a local copy when available. User media is decoded, processed, and encoded on the device and is never sent to a model service.

## AMD SESR x2

- App path: `/models/amd-sesr-x2.onnx`
- Size: 93,732 bytes
- SHA-256: `4B686864A8B17CF9AAAD0D787F7B7A133C95317F408CAC5204701D7291199711`
- Purpose: native 2x learned video super-resolution
- Source: `amd/ryzenai-sesr`, `sesr_nchw_fp32.onnx`
- License: Apache-2.0
- Notes: fixed NCHW 256x256 input, 512x512 output. The application uses reflect-padded overlapping tiles and crops each tile's context halo before stitching.

## RIFE v4.9 ONNX export

- App path: `/models/rife-v4.9.onnx`
- Size: 21,367,656 bytes
- Purpose: video frame interpolation
- Architecture/source project: RIFE / Practical-RIFE
- Source project license: MIT; Practical-RIFE states its trained models use the same license
- ONNX conversion used here: `FuryTMP/RIFE_v4.9` community export, labeled MIT
- Notes: the validated graph accepts one float32 NCHW tensor with seven channels (two RGB frames and a timestep plane) and returns one RGB frame. Inputs are padded to multiples of 64. This is not an official upstream ONNX export.

## Real-ESRGAN General x4 v3

- App path: `/models/realesr-general-x4v3.onnx`
- Size: 4,866,421 bytes
- Purpose: still-image restoration/upscaling
- Architecture/source project: Real-ESRGAN
- Source project license: BSD-3-Clause
- Notes: existing third-party ONNX export of the compact upstream x4 architecture. It remains the still-image enhancer; video uses the native x2 SESR model above for much lower per-frame cost.

## U2NetP

- App path: `/models/u2netp.onnx`
- Purpose: local image background removal

Model and training-data provenance should be reviewed again before redistributing this application outside the business. This manifest is technical documentation, not legal advice.
