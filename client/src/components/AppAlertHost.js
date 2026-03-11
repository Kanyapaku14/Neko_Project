import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { consumeAppAlert, subscribeAppAlerts } from '../services/AppAlert';

// AppAlertHost
// โฮสต์สำหรับแสดง Alert Modal แบบ global (minimal/clean)
// วางไว้ครั้งเดียวใน App root แล้วทุกหน้าสามารถเรียก Alert.alert() ได้เหมือนเดิม

export default function AppAlertHost() {
  const [pending, setPending] = useState([]);
  const [activeId, setActiveId] = useState(null);

  useEffect(() => subscribeAppAlerts(setPending), []);

  const active = useMemo(() => {
    if (activeId) return pending.find((x) => x?.id === activeId) || null;
    return pending.length ? pending[0] : null;
  }, [pending, activeId]);

  useEffect(() => {
    if (!activeId && pending.length) {
      setActiveId(pending[0]?.id || null);
    }
    if (activeId && !pending.some((x) => x?.id === activeId)) {
      setActiveId(null);
    }
  }, [pending, activeId]);

  const close = () => {
    if (!active?.id) return;
    consumeAppAlert(active.id);
    setActiveId(null);
  };

  const handleBackdropClose = () => {
    if (active?.options?.cancelable === false) return;
    close();
  };

  const buttons = Array.isArray(active?.buttons) && active.buttons.length ? active.buttons : [{ text: 'OK' }];
  const isMulti = buttons.length > 2;

  const onPressButton = (btn) => {
    const fn = typeof btn?.onPress === 'function' ? btn.onPress : null;
    close();
    if (fn) setTimeout(() => fn(), 0);
  };

  return (
    <Modal
      visible={Boolean(active)}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={handleBackdropClose}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {!!active?.title && <Text style={styles.title}>{active.title}</Text>}
          {!!active?.message && <Text style={styles.message}>{active.message}</Text>}

          <View style={[styles.buttonRow, isMulti && styles.buttonCol]}>
            {buttons.map((b, idx) => {
              const style = String(b?.style || 'default');
              const isCancel = style === 'cancel';
              const isDestructive = style === 'destructive';
              return (
                <Pressable
                  key={`${active?.id || 'alert'}-btn-${idx}`}
                  onPress={() => onPressButton(b)}
                  style={[
                    styles.button,
                    isMulti && styles.buttonFull,
                    isCancel && styles.buttonCancel,
                    isDestructive && styles.buttonDestructive,
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel && styles.buttonTextCancel,
                      isDestructive && styles.buttonTextDestructive,
                    ]}
                    numberOfLines={1}
                  >
                    {String(b?.text ?? 'OK')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 20,
    marginBottom: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  buttonCol: {
    flexDirection: 'column',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#0C5A58',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 92,
  },
  buttonFull: {
    width: '100%',
  },
  buttonCancel: {
    backgroundColor: '#F1F5F9',
  },
  buttonDestructive: {
    backgroundColor: '#B42318',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  buttonTextCancel: {
    color: '#0F172A',
  },
  buttonTextDestructive: {
    color: '#FFFFFF',
  },
});

