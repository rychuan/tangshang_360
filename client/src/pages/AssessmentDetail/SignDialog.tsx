import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import SignaturePad from '@/components/SignaturePad';

interface SignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signType: 'self' | 'supervisor';
  signImage: string | null;
  setSignImage: (image: string | null) => void;
  loading: boolean;
  onConfirm: () => void;
}

const SignDialog: React.FC<SignDialogProps> = ({
  open,
  onOpenChange,
  signType,
  signImage,
  setSignImage,
  loading,
  onConfirm,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {signType === 'self' ? '本人签名确认' : '上级签名确认'}
          </DialogTitle>
          <DialogDescription>请在下方区域手写签名</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-4">
          <SignaturePad onChange={setSignImage} disabled={loading} />
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button onClick={onConfirm} disabled={loading || !signImage}>
              确认签名
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SignDialog;
