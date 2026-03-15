# Extended Permissions Setup

The COHUA AR Lens uses both GPS location AND internet access simultaneously.
This requires Extended Permissions on both Lens Studio and the Spectacles device.

## In Lens Studio
1. Open Project Settings
2. Check **Experimental API**
3. This enables the combined GPS + Internet usage

## On the Spectacles Device
1. Put on Spectacles
2. Look at the Settings panel (swipe in from right)
3. Go to **Lenses** > **Extended Permissions**
4. Toggle **Enable Extended Permissions** ON
5. This persists across reboots

## What This Means for Publishing
- Lenses with Experimental API CANNOT be published to Lens Explorer publicly
- They can only be used via Push-To-Device from Lens Studio
- They appear in the **Drafts** section of your Lens Explorer
- For public release, we will need to apply for Snap's Extended Permissions program
  via: https://developers.snap.com/spectacles/permission-privacy/extended-permissions

## Snap's Extended Permission Program
Once COHUA is ready for production, apply here to get:
- GPS + Internet combined for public Lenses
- Snap reviews the use case (commercial AR ads - should qualify)
- Timeline: ~2-4 weeks for approval
